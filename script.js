"use strict";

/* =========================================================
   ELEMENTS
   ========================================================= */

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");

const removeFile = document.getElementById("removeFile");
const convertButton = document.getElementById("convertButton");

const status = document.getElementById("status");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");

const errorBox = document.getElementById("errorBox");
const errorMessage = document.getElementById("errorMessage");

const pdfRenderContainer =
    document.getElementById("pdfRenderContainer");


let selectedFile = null;


/* =========================================================
   FILE SELECTION
   ========================================================= */

/*
   IMPORTANT:

   We intentionally do NOT do:

       fileInput.click()

   from JavaScript.

   The HTML <label for="fileInput"> handles the file picker
   natively. This avoids Chrome file-picker problems.
*/

fileInput.addEventListener("change", () => {

    if (
        fileInput.files &&
        fileInput.files.length > 0
    ) {
        selectFile(fileInput.files[0]);
    }

});


/* =========================================================
   DRAG & DROP
   ========================================================= */

dropZone.addEventListener("dragover", (event) => {

    event.preventDefault();

    dropZone.classList.add("drag-over");

});


dropZone.addEventListener("dragleave", () => {

    dropZone.classList.remove("drag-over");

});


dropZone.addEventListener("drop", (event) => {

    event.preventDefault();

    dropZone.classList.remove("drag-over");

    const files = event.dataTransfer.files;

    if (
        files &&
        files.length > 0
    ) {
        selectFile(files[0]);
    }

});


/* =========================================================
   SELECT FILE
   ========================================================= */

function selectFile(file) {

    hideError();

    if (!file) {
        return;
    }


    const isIpynb =
        file.name.toLowerCase().endsWith(".ipynb") ||
        file.type === "application/json";


    if (!isIpynb) {

        showError(
            "Please choose a valid Jupyter Notebook (.ipynb) file."
        );

        return;
    }


    selectedFile = file;


    fileName.textContent = file.name;

    fileSize.textContent =
        formatFileSize(file.size);


    dropZone.classList.add("hidden");

    fileInfo.classList.remove("hidden");

    convertButton.disabled = false;

}


/* =========================================================
   REMOVE FILE
   ========================================================= */

removeFile.addEventListener("click", () => {

    selectedFile = null;

    fileInput.value = "";

    fileInfo.classList.add("hidden");

    dropZone.classList.remove("hidden");

    convertButton.disabled = true;

    hideError();

});


/* =========================================================
   CONVERT BUTTON
   ========================================================= */

convertButton.addEventListener("click", async () => {

    if (!selectedFile) {
        return;
    }


    try {

        hideError();

        convertButton.disabled = true;

        setStatus(
            "Preparing notebook...",
            "Reading your Jupyter Notebook"
        );


        /*
           Make sure external libraries are actually available.
        */

        if (
            typeof marked === "undefined" ||
            typeof DOMPurify === "undefined" ||
            typeof html2canvas === "undefined" ||
            !window.jspdf
        ) {
            throw new Error(
                "Required PDF libraries have not finished loading. Please refresh the page and try again."
            );
        }


        /* Read notebook */

        setStatus(
            "Reading notebook...",
            "Parsing the .ipynb file"
        );

        const text =
            await selectedFile.text();


        let notebook;

        try {

            notebook = JSON.parse(text);

        } catch (error) {

            throw new Error(
                "The selected file is not valid JSON."
            );

        }


        validateNotebook(notebook);


        /* Build notebook HTML */

        setStatus(
            "Building PDF...",
            "Rendering Markdown, code, outputs and equations"
        );


        const element =
            await notebookToHTML(notebook);


        /* Wait for images */

        setStatus(
            "Preparing images...",
            "Waiting for notebook images to finish loading"
        );

        await waitForImages(element);


        /* Wait for MathJax */

        setStatus(
            "Rendering equations...",
            "Preparing mathematical expressions"
        );

        await waitForMath();


        /*
           Give the browser a couple of rendering frames.
           This is important for Chrome, especially after MathJax.
        */

        await nextFrame();
        await nextFrame();


        /* Create PDF */

        setStatus(
            "Creating PDF...",
            "Rendering notebook pages"
        );


        const pdf =
            await createPDF(element);


        /* Download */

        setStatus(
            "Finishing...",
            "Saving your PDF"
        );


        const baseName =
            selectedFile.name
                .replace(/\.ipynb$/i, "")
                .trim() ||
            "notebook";


        pdf.save(
            `${baseName}.pdf`
        );


        setStatus(
            "Done!",
            "Your PDF has been downloaded."
        );


        /*
           Leave the success message visible briefly.
        */

        setTimeout(() => {

            status.classList.add("hidden");

        }, 3000);


    } catch (error) {

        console.error(error);

        showError(
            error && error.message
                ? error.message
                : "Unable to create the PDF."
        );

        status.classList.add("hidden");

    } finally {

        convertButton.disabled =
            !selectedFile;

        /*
           Remove temporary render content.
        */

        pdfRenderContainer.innerHTML = "";

    }

});


/* =========================================================
   NOTEBOOK VALIDATION
   ========================================================= */

function validateNotebook(notebook) {

    if (
        !notebook ||
        typeof notebook !== "object"
    ) {
        throw new Error(
            "The notebook file is empty or invalid."
        );
    }


    if (
        !Array.isArray(notebook.cells)
    ) {
        throw new Error(
            "This file does not contain a valid Jupyter Notebook cell list."
        );
    }

}


/* =========================================================
   NOTEBOOK → HTML
   ========================================================= */

async function notebookToHTML(notebook) {

    const container =
        document.createElement("div");

    container.className =
        "notebook-document";


    /*
       Notebook title
    */

    const title =
        notebook.metadata &&
        notebook.metadata.title
            ? notebook.metadata.title
            : "Jupyter Notebook";


    const titleElement =
        document.createElement("h1");

    titleElement.className =
        "notebook-title";

    titleElement.textContent =
        title;


    container.appendChild(
        titleElement
    );


    /*
       Cells
    */

    for (
        const cell of notebook.cells
    ) {

        if (!cell) {
            continue;
        }


        const cellType =
            cell.cell_type;


        /* -------------------------
           MARKDOWN
           ------------------------- */

        if (cellType === "markdown") {

            const section =
                document.createElement("section");

            section.className =
                "notebook-cell markdown";


            const markdownText =
                sourceToString(
                    cell.source
                );


            const parsed =
                window.marked.parse(
                    markdownText
                );


            section.innerHTML =
                DOMPurify.sanitize(
                    parsed
                );


            container.appendChild(
                section
            );

        }


        /* -------------------------
           CODE
           ------------------------- */

        else if (cellType === "code") {

            const section =
                document.createElement("section");

            section.className =
                "notebook-cell";


            /*
               Code
            */

            const source =
                sourceToString(
                    cell.source
                );


            if (source.trim() !== "") {

                const pre =
                    document.createElement("pre");

                pre.className =
                    "code";


                const code =
                    document.createElement("code");

                code.textContent =
                    source;


                pre.appendChild(code);

                section.appendChild(pre);

            }


            /*
               Outputs
            */

            if (
                Array.isArray(cell.outputs)
            ) {

                for (
                    const output
                    of cell.outputs
                ) {

                    const outputElement =
                        renderOutput(output);


                    if (outputElement) {

                        section.appendChild(
                            outputElement
                        );

                    }

                }

            }


            container.appendChild(
                section
            );

        }

    }


    /*
       Append to the actual document.

       IMPORTANT:
       CSS positions it far outside the viewport,
       but it is NOT visibility:hidden.
       html2canvas therefore can render it.
    */

    pdfRenderContainer.innerHTML = "";

    pdfRenderContainer.appendChild(
        container
    );


    /*
       MathJax
    */

    if (
        window.MathJax &&
        window.MathJax.typesetPromise
    ) {

        try {

            await window.MathJax.typesetPromise(
                [container]
            );

        } catch (error) {

            console.warn(
                "MathJax rendering warning:",
                error
            );

        }

    }


    return container;

}


/* =========================================================
   OUTPUT RENDERING
   ========================================================= */

function renderOutput(output) {

    if (!output) {
        return null;
    }


    const wrapper =
        document.createElement("div");

    wrapper.className =
        "output";


    /* -------------------------
       STREAM
       ------------------------- */

    if (
        output.output_type === "stream"
    ) {

        const pre =
            document.createElement("pre");

        pre.className =
            "output-text";

        pre.textContent =
            sourceToString(
                output.text
            );


        wrapper.appendChild(pre);

        return wrapper;
    }


    /* -------------------------
       ERROR
       ------------------------- */

    if (
        output.output_type === "error"
    ) {

        const pre =
            document.createElement("pre");

        pre.className =
            "output-error";


        const traceback =
            Array.isArray(output.traceback)
                ? output.traceback.join("\n")
                : "";


        pre.textContent =
            traceback ||
            `${output.ename || "Error"}: ${output.evalue || ""}`;


        wrapper.appendChild(pre);

        return wrapper;
    }


    /* -------------------------
       DISPLAY DATA
       ------------------------- */

    if (
        output.output_type === "display_data" ||
        output.output_type === "execute_result"
    ) {

        return renderMimeBundle(
            output.data
        );

    }


    return null;

}


/* =========================================================
   MIME BUNDLE
   ========================================================= */

function renderMimeBundle(data) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        return null;
    }


    const wrapper =
        document.createElement("div");

    wrapper.className =
        "output";


    /*
       HTML
       Prefer HTML over plain text.
    */

    if (
        data["text/html"]
    ) {

        const html =
            sourceToString(
                data["text/html"]
            );


        const htmlElement =
            document.createElement("div");

        htmlElement.className =
            "output-html";


        htmlElement.innerHTML =
            DOMPurify.sanitize(
                html
            );


        wrapper.appendChild(
            htmlElement
        );


        return wrapper;
    }


    /*
       PNG
    */

    if (
        data["image/png"]
    ) {

        const img =
            document.createElement("img");


        img.src =
            "data:image/png;base64," +
            cleanBase64(
                sourceToString(
                    data["image/png"]
                )
            );


        img.alt =
            "Notebook output";


        wrapper.appendChild(img);

        return wrapper;
    }


    /*
       JPEG
    */

    if (
        data["image/jpeg"]
    ) {

        const img =
            document.createElement("img");


        img.src =
            "data:image/jpeg;base64," +
            cleanBase64(
                sourceToString(
                    data["image/jpeg"]
                )
            );


        img.alt =
            "Notebook output";


        wrapper.appendChild(img);

        return wrapper;
    }


    /*
       SVG
    */

    if (
        data["image/svg+xml"]
    ) {

        const svg =
            sourceToString(
                data["image/svg+xml"]
            );


        const svgElement =
            document.createElement("div");


        svgElement.innerHTML =
            DOMPurify.sanitize(
                svg,
                {
                    USE_PROFILES: {
                        svg: true,
                        svgFilters: true
                    }
                }
            );


        wrapper.appendChild(
            svgElement
        );


        return wrapper;
    }


    /*
       Plain text
    */

    if (
        data["text/plain"]
    ) {

        const pre =
            document.createElement("pre");

        pre.className =
            "output-text";


        pre.textContent =
            sourceToString(
                data["text/plain"]
            );


        wrapper.appendChild(pre);

        return wrapper;
    }


    return null;

}


/* =========================================================
   PDF CREATION
   ========================================================= */

async function createPDF(element) {
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true
    });

    const PAGE_WIDTH_MM = 210;
    const PAGE_HEIGHT_MM = 297;

    const MARGIN_MM = 8;

    const CONTENT_WIDTH_MM =
        PAGE_WIDTH_MM - MARGIN_MM * 2;

    const CONTENT_HEIGHT_MM =
        PAGE_HEIGHT_MM - MARGIN_MM * 2;

    /*
     * The source notebook is 794px wide.
     *
     * This is the same width used by your original
     * notebook styling.
     */
    const SOURCE_WIDTH = 794;

    /*
     * Scale controls PDF quality vs Chrome memory use.
     *
     * 1.35 is a good compromise.
     */
    const SCALE = 1.35;

    /*
     * Get the complete notebook height.
     */
    const totalHeight = element.scrollHeight;

    /*
     * Calculate how many source pixels correspond
     * to one A4 page.
     */
    const sourcePageHeight =
        SOURCE_WIDTH *
        CONTENT_HEIGHT_MM /
        CONTENT_WIDTH_MM;

    const pageCount =
        Math.ceil(
            totalHeight / sourcePageHeight
        );

    /*
     * Temporary rendering area.
     *
     * Only ONE page is placed here at a time.
     */
    const pageRenderer =
        document.createElement("div");

    pageRenderer.style.position = "fixed";
    pageRenderer.style.left = "-100000px";
    pageRenderer.style.top = "0";

    pageRenderer.style.width =
        `${SOURCE_WIDTH}px`;

    pageRenderer.style.background =
        "#ffffff";

    pageRenderer.style.overflow =
        "hidden";

    pageRenderer.style.pointerEvents =
        "none";

    document.body.appendChild(
        pageRenderer
    );


    try {

        for (
            let pageIndex = 0;
            pageIndex < pageCount;
            pageIndex++
        ) {

            setStatus(
                "Creating PDF...",
                `Rendering page ${pageIndex + 1} of ${pageCount}`
            );


            /*
             * Source coordinates for this page.
             */
            const startY =
                pageIndex *
                sourcePageHeight;

            const remainingHeight =
                totalHeight - startY;

            const thisPageHeight =
                Math.min(
                    sourcePageHeight,
                    remainingHeight
                );


            /*
             * Create a page-sized notebook.
             */
            const page =
                document.createElement("div");

            page.className =
                "notebook-document";


            /*
             * Match the original notebook width.
             */
            page.style.width =
                `${SOURCE_WIDTH}px`;

            page.style.height =
                `${thisPageHeight}px`;

            page.style.padding =
                "42px 46px";

            page.style.margin =
                "0";

            page.style.background =
                "#ffffff";

            page.style.position =
                "relative";

            page.style.overflow =
                "hidden";


            /*
             * Instead of rendering the whole notebook,
             * copy only the content belonging to this
             * vertical region.
             *
             * We use the original notebook as the source
             * and shift it upward inside the page.
             */
            const content =
                element.cloneNode(true);

            content.style.position =
                "absolute";

            content.style.left =
                "0";

            content.style.top =
                `${-startY}px`;

            content.style.width =
                `${SOURCE_WIDTH}px`;

            content.style.margin =
                "0";

            content.style.padding =
                "42px 46px";

            content.style.background =
                "#ffffff";


            page.appendChild(
                content
            );


            pageRenderer.appendChild(
                page
            );


            /*
             * Let Chrome perform layout before capture.
             */
            await nextFrame();


            /*
             * Render ONLY this page-sized container.
             *
             * cullOffscreen prevents html2canvas from
             * spending time painting things outside
             * the capture region.
             */
            const canvas =
                await html2canvas(
                    page,
                    {
                        scale: SCALE,

                        width: SOURCE_WIDTH,

                        height: thisPageHeight,

                        x: 0,

                        y: 0,

                        backgroundColor:
                            "#ffffff",

                        useCORS: true,

                        allowTaint: false,

                        imageTimeout: 30000,

                        logging: false,

                        cullOffscreen: true,

                        scrollX: 0,

                        scrollY: 0,

                        windowWidth:
                            SOURCE_WIDTH,

                        windowHeight:
                            Math.ceil(
                                thisPageHeight
                            )
                    }
                );


            /*
             * Add PDF page.
             */
            if (pageIndex > 0) {
                pdf.addPage();
            }


            /*
             * Convert canvas to PNG.
             *
             * PNG preserves notebook text much better
             * than repeatedly JPEG-compressing it.
             */
            const imageData =
                canvas.toDataURL(
                    "image/png"
                );


            /*
             * Calculate the actual displayed height.
             */
            const imageHeight =
                CONTENT_WIDTH_MM *
                canvas.height /
                canvas.width;


            pdf.addImage(
                imageData,
                "PNG",
                MARGIN_MM,
                MARGIN_MM,
                CONTENT_WIDTH_MM,
                Math.min(
                    imageHeight,
                    CONTENT_HEIGHT_MM
                ),
                undefined,
                "FAST"
            );


            /*
             * Very important:
             * release the large canvas immediately.
             */
            canvas.width = 1;
            canvas.height = 1;


            /*
             * Remove this page before creating
             * the next one.
             */
            pageRenderer.removeChild(
                page
            );


            /*
             * Let Chrome breathe between pages.
             *
             * This prevents the renderer from accumulating
             * 95 large canvases at once.
             */
            await nextFrame();
            await nextFrame();
        }


    } finally {

        /*
         * Always clean up, even if one page fails.
         */
        pageRenderer.remove();

    }


    return pdf;
}


/* =========================================================
   IMAGE WAITING
   ========================================================= */

async function waitForImages(
    root
) {

    const images =
        Array.from(
            root.querySelectorAll("img")
        );


    if (images.length === 0) {
        return;
    }


    await Promise.all(
        images.map((img) => {

            if (img.complete) {

                if (
                    img.naturalWidth === 0 &&
                    img.src
                ) {
                    return Promise.resolve();
                }

                return Promise.resolve();
            }


            return new Promise(
                (resolve) => {

                    const finish = () => {
                        resolve();
                    };


                    img.addEventListener(
                        "load",
                        finish,
                        {
                            once: true
                        }
                    );


                    img.addEventListener(
                        "error",
                        finish,
                        {
                            once: true
                        }
                    );


                    /*
                       Prevent one broken image from
                       blocking the entire PDF.
                    */

                    setTimeout(
                        resolve,
                        30000
                    );

                }
            );

        })
    );

}


/* =========================================================
   MATHJAX WAIT
   ========================================================= */

async function waitForMath() {

    if (
        !window.MathJax
    ) {
        return;
    }


    if (
        typeof window.MathJax.typesetPromise ===
        "function"
    ) {

        try {

            await window.MathJax.typesetPromise();

        } catch (error) {

            console.warn(
                "MathJax typesetting warning:",
                error
            );

        }

    }

}


/* =========================================================
   UTILITIES
   ========================================================= */

function sourceToString(value) {

    if (
        Array.isArray(value)
    ) {
        return value.join("");
    }


    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }


    return String(value);

}


/* =========================================================
   BASE64 CLEANUP
   ========================================================= */

function cleanBase64(value) {

    if (!value) {
        return "";
    }


    return String(value)
        .replace(/^data:[^;]+;base64,/i, "")
        .replace(/\s/g, "");

}


/* =========================================================
   FILE SIZE
   ========================================================= */

function formatFileSize(bytes) {

    if (bytes < 1024) {
        return `${bytes} B`;
    }


    if (bytes < 1024 * 1024) {

        return (
            `${(bytes / 1024).toFixed(1)} KB`
        );

    }


    return (
        `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    );

}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(
    title,
    text
) {

    status.classList.remove(
        "hidden"
    );

    statusTitle.textContent =
        title;

    statusText.textContent =
        text;

}


/* =========================================================
   ERROR
   ========================================================= */

function showError(message) {

    errorMessage.textContent =
        message;

    errorBox.classList.remove(
        "hidden"
    );

}


function hideError() {

    errorBox.classList.add(
        "hidden"
    );

    errorMessage.textContent =
        "";

}


/* =========================================================
   NEXT FRAME
   ========================================================= */

function nextFrame() {

    return new Promise(
        (resolve) => {

            requestAnimationFrame(
                () => resolve()
            );

        }
    );

}
