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

    const {
        jsPDF
    } = window.jspdf;


    /*
       A4 dimensions in mm.
    */

    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    /*
       PDF dimensions.
    */

    const pageWidth =
        210;

    const pageHeight =
        297;


    /*
       Margins.

       Keeping a small PDF margin gives the notebook
       the clean appearance of the original version.
    */

    const margin =
        8;


    const contentWidth =
        pageWidth - margin * 2;

    const contentHeight =
        pageHeight - margin * 2;


    /*
       Actual notebook size in CSS pixels.
    */

    const elementWidth =
        element.scrollWidth;


    const elementHeight =
        element.scrollHeight;


    if (
        elementWidth <= 0 ||
        elementHeight <= 0
    ) {
        throw new Error(
            "The notebook produced an empty PDF area."
        );
    }


    /*
       The important Chrome optimization:

       DO NOT create a giant canvas at scale 2.

       Instead, capture the notebook in page-sized
       vertical pieces.

       Scale 1.35 gives substantially less memory
       pressure than scale 2 while still producing
       a sharp PDF.
    */

    const scale =
        1.35;


    /*
       Convert PDF page height to source CSS pixels.

       We keep the same aspect ratio as the original
       notebook document.
    */

    const sourcePageHeight =
        elementWidth *
        contentHeight /
        contentWidth;


    const pageCount =
        Math.ceil(
            elementHeight /
            sourcePageHeight
        );


    /*
       Progress helper.
    */

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
           Determine source crop.
        */

        const sourceY =
            pageIndex *
            sourcePageHeight;


        const remaining =
            elementHeight -
            sourceY;


        const currentHeight =
            Math.min(
                sourcePageHeight,
                remaining
            );


        /*
           Capture only the required region.

           The notebook styling itself is untouched.
        */

        const canvas =
            await html2canvas(
                element,
                {
                    scale: scale,

                    x: 0,
                    y: sourceY,

                    width: elementWidth,
                    height: currentHeight,

                    backgroundColor: "#ffffff",

                    useCORS: true,

                    allowTaint: false,

                    imageTimeout: 30000,

                    logging: false,

                    /*
                       Keep rendering predictable.
                    */

                    scrollX: 0,
                    scrollY: 0,

                    windowWidth:
                        Math.max(
                            document.documentElement.clientWidth,
                            elementWidth
                        ),

                    windowHeight:
                        Math.max(
                            window.innerHeight,
                            900
                        )
                }
            );


        /*
           Add a new PDF page after the first.
        */

        if (pageIndex > 0) {

            pdf.addPage();

        }


        /*
           Preserve the aspect ratio.
        */

        const imageWidth =
            contentWidth;


        const imageHeight =
            imageWidth *
            canvas.height /
            canvas.width;


        /*
           PNG keeps text and notebook outputs
           cleaner than heavily compressed JPEG.
        */

        const imageData =
            canvas.toDataURL(
                "image/png"
            );


        pdf.addImage(
            imageData,
            "PNG",
            margin,
            margin,
            imageWidth,
            Math.min(
                imageHeight,
                contentHeight
            ),
            undefined,
            "FAST"
        );


        /*
           Release the canvas memory immediately.

           This is particularly important for Chrome.
        */

        canvas.width = 1;
        canvas.height = 1;


        /*
           Give Chrome a chance to process garbage
           collection / rendering work before continuing.
        */

        await nextFrame();

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
