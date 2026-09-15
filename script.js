"use strict";

/* =========================================================
   DOM
========================================================= */

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const removeFile = document.getElementById("removeFile");

const convertButton = document.getElementById("convertButton");

const status = document.getElementById("status");
const statusText = document.getElementById("statusText");

const errorBox = document.getElementById("errorBox");
const errorText = document.getElementById("errorText");

let selectedFile = null;


/* =========================================================
   FILE PICKER
========================================================= */

/*
 * Only the drop zone opens the picker.
 * This avoids nested click handlers triggering the picker
 * more than once.
 */

dropZone.addEventListener("click", () => {
    fileInput.click();
});


fileInput.addEventListener("change", (event) => {

    const file = event.target.files &&
                 event.target.files[0];

    if (file) {
        handleFile(file);
    }
});


/* =========================================================
   DRAG & DROP
========================================================= */

dropZone.addEventListener("dragover", (event) => {

    event.preventDefault();

    event.stopPropagation();

    dropZone.classList.add("dragover");
});


dropZone.addEventListener("dragleave", (event) => {

    event.preventDefault();

    dropZone.classList.remove("dragover");
});


dropZone.addEventListener("drop", (event) => {

    event.preventDefault();

    event.stopPropagation();

    dropZone.classList.remove("dragover");

    const file =
        event.dataTransfer &&
        event.dataTransfer.files &&
        event.dataTransfer.files[0];

    if (file) {
        handleFile(file);
    }
});


/* =========================================================
   HANDLE FILE
========================================================= */

function handleFile(file) {

    hideError();

    if (!file.name.toLowerCase().endsWith(".ipynb")) {

        showError(
            "Please select a valid .ipynb file."
        );

        return;
    }

    selectedFile = file;

    fileName.textContent =
        file.name;

    fileInfo.classList.remove("hidden");

    dropZone.classList.add("has-file");

    convertButton.disabled = false;
}


/* =========================================================
   REMOVE FILE
========================================================= */

removeFile.addEventListener("click", (event) => {

    event.preventDefault();

    event.stopPropagation();

    selectedFile = null;

    fileInput.value = "";

    fileInfo.classList.add("hidden");

    dropZone.classList.remove("has-file");

    convertButton.disabled = true;

    hideError();
});


/* =========================================================
   CONVERT
========================================================= */

convertButton.addEventListener(
    "click",
    async (event) => {

        event.preventDefault();

        event.stopPropagation();

        if (!selectedFile) {

            showError(
                "Please select a notebook first."
            );

            return;
        }

        try {

            hideError();

            setLoading(
                true,
                "Checking PDF libraries..."
            );


            /* -----------------------------------------
               Check libraries
            ----------------------------------------- */

            if (!window.marked) {
                throw new Error(
                    "Marked failed to load."
                );
            }

            if (!window.DOMPurify) {
                throw new Error(
                    "DOMPurify failed to load."
                );
            }

            if (!window.html2canvas) {
                throw new Error(
                    "html2canvas failed to load."
                );
            }

            if (!window.jspdf) {
                throw new Error(
                    "jsPDF failed to load."
                );
            }


            /* -----------------------------------------
               Read notebook
            ----------------------------------------- */

            setLoading(
                true,
                "Reading your notebook..."
            );

            const text =
                await selectedFile.text();

            let notebook;

            try {

                notebook =
                    JSON.parse(text);

            } catch (error) {

                throw new Error(
                    "The selected file is not valid JSON."
                );
            }


            if (
                !notebook ||
                !Array.isArray(notebook.cells)
            ) {

                throw new Error(
                    "This file does not appear to be a valid Jupyter Notebook."
                );
            }


            /* -----------------------------------------
               Render HTML
            ----------------------------------------- */

            setLoading(
                true,
                "Rendering notebook..."
            );

            const rendered =
                await notebookToHTML(
                    notebook
                );


            /* -----------------------------------------
               Images
            ----------------------------------------- */

            setLoading(
                true,
                "Loading notebook images..."
            );

            await waitForImages(
                rendered
            );


            /* -----------------------------------------
               Math
            ----------------------------------------- */

            setLoading(
                true,
                "Rendering mathematical formulas..."
            );

            await waitForMath(
                rendered
            );


            /* -----------------------------------------
               Chrome paint delay
            ----------------------------------------- */

            await new Promise(resolve =>
                requestAnimationFrame(resolve)
            );

            await new Promise(resolve =>
                requestAnimationFrame(resolve)
            );

            await new Promise(resolve =>
                setTimeout(resolve, 300)
            );


            /* -----------------------------------------
               Create PDF
            ----------------------------------------- */

            setLoading(
                true,
                "Creating PDF..."
            );

            const pdf =
                await createPDF(
                    rendered
                );


            /* -----------------------------------------
               Save
            ----------------------------------------- */

            setLoading(
                true,
                "Saving PDF..."
            );

            const outputName =
                selectedFile.name.replace(
                    /\.ipynb$/i,
                    ""
                ) + ".pdf";

            pdf.save(outputName);


            /* -----------------------------------------
               Cleanup
            ----------------------------------------- */

            rendered.remove();

            setLoading(
                false
            );

        } catch (error) {

            console.error(
                "PDF conversion error:",
                error
            );

            setLoading(
                false
            );

            showError(
                error && error.message
                    ? error.message
                    : "Conversion failed. Please try again."
            );
        }
    }
);


/* =========================================================
   NOTEBOOK → HTML
========================================================= */

async function notebookToHTML(notebook) {

    const container =
        document.createElement("div");

    container.className =
        "pdf-render-container";


    const documentElement =
        document.createElement("div");

    documentElement.className =
        "notebook-document";


    /* -----------------------------------------
       Title
    ----------------------------------------- */

    if (
        notebook.metadata &&
        notebook.metadata.title
    ) {

        const title =
            document.createElement("h1");

        title.className =
            "notebook-title";

        title.textContent =
            notebook.metadata.title;

        documentElement.appendChild(
            title
        );
    }


    /* -----------------------------------------
       Cells
    ----------------------------------------- */

    notebook.cells.forEach(
        (cell, index) => {

            const cellElement =
                document.createElement("section");

            cellElement.className =
                "notebook-cell";

            cellElement.dataset.cellIndex =
                index;


            /* ==============================
               MARKDOWN
            ============================== */

            if (
                cell.cell_type ===
                "markdown"
            ) {

                const markdown =
                    sourceToString(
                        cell.source
                    );

                let html =
                    window.marked.parse(
                        markdown
                    );

                html =
                    window.DOMPurify.sanitize(
                        html
                    );

                cellElement.innerHTML =
                    `<div class="markdown-cell">
                        ${html}
                    </div>`;
            }


            /* ==============================
               CODE
            ============================== */

            else if (
                cell.cell_type ===
                "code"
            ) {

                const source =
                    sourceToString(
                        cell.source
                    );


                if (source.trim()) {

                    const pre =
                        document.createElement(
                            "pre"
                        );

                    pre.className =
                        "code";


                    const code =
                        document.createElement(
                            "code"
                        );

                    code.textContent =
                        source;


                    pre.appendChild(
                        code
                    );

                    cellElement.appendChild(
                        pre
                    );
                }


                /* Outputs */

                if (
                    Array.isArray(
                        cell.outputs
                    )
                ) {

                    cell.outputs.forEach(
                        output => {

                            const renderedOutput =
                                renderOutput(
                                    output
                                );

                            if (
                                renderedOutput
                            ) {

                                cellElement.appendChild(
                                    renderedOutput
                                );
                            }
                        }
                    );
                }
            }


            /* ==============================
               RAW
            ============================== */

            else if (
                cell.cell_type ===
                "raw"
            ) {

                const raw =
                    sourceToString(
                        cell.source
                    );

                const pre =
                    document.createElement(
                        "pre"
                    );

                pre.className =
                    "raw-cell";

                pre.textContent =
                    raw;

                cellElement.appendChild(
                    pre
                );
            }


            documentElement.appendChild(
                cellElement
            );
        }
    );


    container.appendChild(
        documentElement
    );

    document.body.appendChild(
        container
    );


    /* -----------------------------------------
       MathJax
    ----------------------------------------- */

    if (
        window.MathJax &&
        typeof window.MathJax.typesetPromise ===
        "function"
    ) {

        try {

            await window.MathJax.typesetPromise(
                [container]
            );

        } catch (error) {

            console.warn(
                "MathJax warning:",
                error
            );
        }
    }


    return container;
}


/* =========================================================
   SOURCE → STRING
========================================================= */

function sourceToString(source) {

    if (Array.isArray(source)) {
        return source.join("");
    }

    if (typeof source === "string") {
        return source;
    }

    return "";
}


/* =========================================================
   OUTPUT
========================================================= */

function renderOutput(output) {

    if (!output) {
        return null;
    }

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "output";


    /* -----------------------------------------
       STREAM
    ----------------------------------------- */

    if (
        output.output_type ===
        "stream"
    ) {

        const pre =
            document.createElement(
                "pre"
            );

        pre.className =
            "output-stream";

        pre.textContent =
            sourceToString(
                output.text
            );

        wrapper.appendChild(
            pre
        );

        return wrapper;
    }


    /* -----------------------------------------
       ERROR
    ----------------------------------------- */

    if (
        output.output_type ===
        "error"
    ) {

        const pre =
            document.createElement(
                "pre"
            );

        pre.className =
            "output-error";


        const traceback =
            Array.isArray(
                output.traceback
            )
                ? output.traceback.join("\n")
                : "";


        pre.textContent =
            traceback ||
            `${output.ename || "Error"}: ${
                output.evalue || ""
            }`;


        wrapper.appendChild(
            pre
        );

        return wrapper;
    }


    /* -----------------------------------------
       DISPLAY DATA / EXECUTE RESULT
    ----------------------------------------- */

    if (
        output.output_type ===
        "display_data" ||
        output.output_type ===
        "execute_result"
    ) {

        const data =
            output.data || {};


        /* PNG */

        if (data["image/png"]) {

            const img =
                document.createElement(
                    "img"
                );

            img.className =
                "output-image";

            img.src =
                "data:image/png;base64," +
                cleanBase64(
                    data["image/png"]
                );

            img.alt =
                "Notebook output";

            wrapper.appendChild(
                img
            );

            return wrapper;
        }


        /* JPEG */

        if (data["image/jpeg"]) {

            const img =
                document.createElement(
                    "img"
                );

            img.className =
                "output-image";

            img.src =
                "data:image/jpeg;base64," +
                cleanBase64(
                    data["image/jpeg"]
                );

            img.alt =
                "Notebook output";

            wrapper.appendChild(
                img
            );

            return wrapper;
        }


        /* SVG */

        if (data["image/svg+xml"]) {

            const svg =
                window.DOMPurify.sanitize(
                    sourceToString(
                        data["image/svg+xml"]
                    ),
                    {
                        USE_PROFILES: {
                            svg: true,
                            svgFilters: true
                        }
                    }
                );


            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "output-svg";

            div.innerHTML =
                svg;

            wrapper.appendChild(
                div
            );

            return wrapper;
        }


        /* HTML */

        if (data["text/html"]) {

            const html =
                window.DOMPurify.sanitize(
                    sourceToString(
                        data["text/html"]
                    )
                );


            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "output-html";

            div.innerHTML =
                html;

            wrapper.appendChild(
                div
            );

            return wrapper;
        }


        /* Plain text */

        if (data["text/plain"]) {

            const pre =
                document.createElement(
                    "pre"
                );

            pre.className =
                "output-text";

            pre.textContent =
                sourceToString(
                    data["text/plain"]
                );

            wrapper.appendChild(
                pre
            );

            return wrapper;
        }
    }


    return null;
}


/* =========================================================
   BASE64
========================================================= */

function cleanBase64(value) {

    if (Array.isArray(value)) {
        value = value.join("");
    }

    if (typeof value !== "string") {
        return "";
    }

    return value.replace(
        /\s/g,
        ""
    );
}


/* =========================================================
   WAIT FOR IMAGES
========================================================= */

async function waitForImages(
    container
) {

    const images =
        Array.from(
            container.querySelectorAll(
                "img"
            )
        );


    if (!images.length) {
        return;
    }


    await Promise.all(
        images.map(img => {

            if (img.complete) {
                return Promise.resolve();
            }


            return new Promise(
                resolve => {

                    img.addEventListener(
                        "load",
                        resolve,
                        { once: true }
                    );

                    img.addEventListener(
                        "error",
                        resolve,
                        { once: true }
                    );
                }
            );
        })
    );
}


/* =========================================================
   WAIT FOR MATH
========================================================= */

async function waitForMath(
    container
) {

    if (
        !window.MathJax ||
        !window.MathJax.startup
    ) {
        return;
    }


    try {

        if (
            window.MathJax.startup.promise
        ) {

            await window.MathJax.startup.promise;
        }


        if (
            typeof window.MathJax.typesetPromise ===
            "function"
        ) {

            await window.MathJax.typesetPromise(
                [container]
            );
        }

    } catch (error) {

        console.warn(
            "MathJax warning:",
            error
        );
    }
}


/* =========================================================
   CREATE PDF
   CHROME-SAFE CHUNKED VERSION
========================================================= */

async function createPDF(
    element
) {

    if (!element) {

        throw new Error(
            "PDF render element not found."
        );
    }


    const {
        jsPDF
    } = window.jspdf;


    /* -----------------------------------------
       Stable width
    ----------------------------------------- */

    const renderWidth = 794;


    element.style.width =
        `${renderWidth}px`;

    element.style.maxWidth =
        `${renderWidth}px`;

    element.style.minWidth =
        `${renderWidth}px`;

    element.style.background =
        "#ffffff";

    element.style.display =
        "block";

    element.style.visibility =
        "visible";

    element.style.opacity =
        "1";


    /* -----------------------------------------
       Browser paint
    ----------------------------------------- */

    await new Promise(resolve =>
        requestAnimationFrame(resolve)
    );

    await new Promise(resolve =>
        requestAnimationFrame(resolve)
    );


    /* -----------------------------------------
       Dimensions
    ----------------------------------------- */

    const totalWidth =
        Math.ceil(
            element.scrollWidth
        );

    const totalHeight =
        Math.ceil(
            element.scrollHeight
        );


    if (
        !totalWidth ||
        !totalHeight
    ) {

        throw new Error(
            "The notebook produced no visible content."
        );
    }


    /* -----------------------------------------
       PDF
    ----------------------------------------- */

    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    const pageWidth = 210;
    const pageHeight = 297;

    const margin = 10;

    const usableWidth =
        pageWidth - margin * 2;

    const usableHeight =
        pageHeight - margin * 2;


    /*
     * Small chunks prevent Chrome from creating
     * one enormous canvas.
     */

    const chunkHeight = 900;

    const scale = 1.5;


    let currentY = 0;

    let pageNumber = 0;


    /* =================================================
       CHUNKS
    ================================================= */

    while (
        currentY < totalHeight
    ) {

        const remainingHeight =
            totalHeight -
            currentY;


        const captureHeight =
            Math.min(
                chunkHeight,
                remainingHeight
            );


        /* -----------------------------------------
           Wrapper
        ----------------------------------------- */

        const wrapper =
            document.createElement(
                "div"
            );


        wrapper.style.position =
            "absolute";

        wrapper.style.left =
            "0px";

        wrapper.style.top =
            "0px";

        wrapper.style.width =
            `${totalWidth}px`;

        wrapper.style.height =
            `${captureHeight}px`;

        wrapper.style.overflow =
            "hidden";

        wrapper.style.background =
            "#ffffff";

        wrapper.style.zIndex =
            "-999999";


        /* -----------------------------------------
           Clone
        ----------------------------------------- */

        const clone =
            element.cloneNode(
                true
            );


        clone.style.position =
            "absolute";

        clone.style.left =
            "0px";

        clone.style.top =
            `${-currentY}px`;

        clone.style.width =
            `${totalWidth}px`;

        clone.style.maxWidth =
            `${totalWidth}px`;

        clone.style.minWidth =
            `${totalWidth}px`;

        clone.style.margin =
            "0";

        clone.style.padding =
            "0";

        clone.style.background =
            "#ffffff";


        wrapper.appendChild(
            clone
        );

        document.body.appendChild(
            wrapper
        );


        /* -----------------------------------------
           Paint clone
        ----------------------------------------- */

        await new Promise(resolve =>
            requestAnimationFrame(resolve)
        );

        await new Promise(resolve =>
            requestAnimationFrame(resolve)
        );

        await new Promise(resolve =>
            setTimeout(resolve, 50)
        );


        let canvas;


        /* -----------------------------------------
           html2canvas
        ----------------------------------------- */

        try {

            canvas =
                await html2canvas(
                    wrapper,
                    {
                        scale: scale,

                        backgroundColor:
                            "#ffffff",

                        useCORS: true,

                        allowTaint: false,

                        logging: false,

                        imageTimeout: 30000,

                        width:
                            totalWidth,

                        height:
                            captureHeight,

                        windowWidth:
                            totalWidth,

                        windowHeight:
                            captureHeight,

                        scrollX: 0,

                        scrollY: 0,

                        x: 0,

                        y: 0
                    }
                );

        } finally {

            wrapper.remove();
        }


        /* -----------------------------------------
           Validate
        ----------------------------------------- */

        if (
            !canvas ||
            canvas.width === 0 ||
            canvas.height === 0
        ) {

            throw new Error(
                "Chrome produced an empty canvas while rendering the notebook."
            );
        }


        /* -----------------------------------------
           PDF page size in pixels
        ----------------------------------------- */

        const pixelsPerPdfPage =
            (
                usableHeight /
                usableWidth
            ) *
            canvas.width;


        let sourceY = 0;


        /* =================================================
           PAGES
        ================================================= */

        while (
            sourceY < canvas.height
        ) {

            const sourceHeight =
                Math.min(
                    pixelsPerPdfPage,
                    canvas.height -
                    sourceY
                );


            const pageCanvas =
                document.createElement(
                    "canvas"
                );


            pageCanvas.width =
                canvas.width;

            pageCanvas.height =
                Math.ceil(
                    sourceHeight
                );


            const context =
                pageCanvas.getContext(
                    "2d",
                    {
                        alpha: false
                    }
                );


            context.fillStyle =
                "#ffffff";


            context.fillRect(
                0,
                0,
                pageCanvas.width,
                pageCanvas.height
            );


            context.drawImage(
                canvas,

                0,
                sourceY,

                canvas.width,
                sourceHeight,

                0,
                0,

                pageCanvas.width,
                pageCanvas.height
            );


            const imageData =
                pageCanvas.toDataURL(
                    "image/jpeg",
                    0.92
                );


            if (
                pageNumber > 0
            ) {

                pdf.addPage();
            }


            const imageHeight =
                (
                    sourceHeight /
                    canvas.width
                ) *
                usableWidth;


            pdf.addImage(
                imageData,
                "JPEG",

                margin,
                margin,

                usableWidth,
                imageHeight,

                undefined,
                "FAST"
            );


            pageNumber++;

            sourceY +=
                sourceHeight;


            await new Promise(resolve =>
                requestAnimationFrame(resolve)
            );


            pageCanvas.width = 1;
            pageCanvas.height = 1;
        }


        /* -----------------------------------------
           Next chunk
        ----------------------------------------- */

        currentY +=
            captureHeight;


        canvas.width = 1;
        canvas.height = 1;


        await new Promise(resolve =>
            setTimeout(resolve, 30)
        );


        const progress =
            Math.min(
                100,
                Math.round(
                    (
                        currentY /
                        totalHeight
                    ) * 100
                )
            );


        statusText.textContent =
            `Creating PDF... ${progress}%`;
    }


    if (
        pageNumber === 0
    ) {

        throw new Error(
            "No PDF pages were generated."
        );
    }


    return pdf;
}


/* =========================================================
   LOADING
========================================================= */

function setLoading(
    loading,
    message = ""
) {

    if (loading) {

        status.classList.remove(
            "hidden"
        );

        statusText.textContent =
            message;

        convertButton.disabled =
            true;

    } else {

        status.classList.add(
            "hidden"
        );

        convertButton.disabled =
            !selectedFile;
    }
}


/* =========================================================
   ERROR
========================================================= */

function showError(message) {

    errorText.textContent =
        message;

    errorBox.classList.remove(
        "hidden"
    );
}


function hideError() {

    errorBox.classList.add(
        "hidden"
    );

    errorText.textContent =
        "";
}
