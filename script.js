"use strict";

/* =========================================================
   DOM ELEMENTS
========================================================= */

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const browseButton = document.getElementById("browseButton");

const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const removeFile = document.getElementById("removeFile");

const convertButton = document.getElementById("convertButton");

const status = document.getElementById("status");
const statusText = document.getElementById("statusText");

const errorBox = document.getElementById("errorBox");
const errorText = document.getElementById("errorText");


/* =========================================================
   STATE
========================================================= */

let selectedFile = null;


/* =========================================================
   FILE SELECTION
========================================================= */

browseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput.click();
});

dropZone.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
        handleFile(file);
    }
});


/* =========================================================
   DRAG & DROP
========================================================= */

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();

    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();

    dropZone.classList.remove("dragover");

    const file = event.dataTransfer.files[0];

    if (file) {
        handleFile(file);
    }
});


/* =========================================================
   HANDLE FILE
========================================================= */

function handleFile(file) {

    hideError();

    const isIpynb =
        file.name.toLowerCase().endsWith(".ipynb");

    if (!isIpynb) {
        showError("Please select a valid .ipynb file.");
        return;
    }

    selectedFile = file;

    fileName.textContent = file.name;

    fileInfo.classList.remove("hidden");

    dropZone.classList.add("has-file");

    convertButton.disabled = false;
}


/* =========================================================
   REMOVE FILE
========================================================= */

removeFile.addEventListener("click", () => {

    selectedFile = null;

    fileInput.value = "";

    fileInfo.classList.add("hidden");

    dropZone.classList.remove("has-file");

    convertButton.disabled = true;

    hideError();
});


/* =========================================================
   CONVERT BUTTON
========================================================= */

convertButton.addEventListener("click", async () => {

    if (!selectedFile) {
        showError("Please select a notebook first.");
        return;
    }

    try {

        hideError();

        setLoading(true, "Checking PDF libraries...");

        if (
            !window.marked ||
            !window.DOMPurify ||
            !window.html2canvas ||
            !window.jspdf
        ) {
            throw new Error(
                "One or more required PDF libraries failed to load. Please refresh the page and try again."
            );
        }

        setLoading(true, "Reading your notebook...");

        const text = await selectedFile.text();

        let notebook;

        try {
            notebook = JSON.parse(text);
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


        /* -------------------------------------------------
           CREATE HTML
        ------------------------------------------------- */

        setLoading(
            true,
            "Rendering notebook..."
        );

        const rendered = await notebookToHTML(notebook);


        /* -------------------------------------------------
           WAIT FOR IMAGES
        ------------------------------------------------- */

        setLoading(
            true,
            "Loading notebook images..."
        );

        await waitForImages(rendered);


        /* -------------------------------------------------
           WAIT FOR MATHJAX
        ------------------------------------------------- */

        setLoading(
            true,
            "Rendering mathematical formulas..."
        );

        await waitForMath(rendered);


        /* -------------------------------------------------
           EXTRA CHROME PAINT TIME
        ------------------------------------------------- */

        await new Promise(resolve =>
            requestAnimationFrame(resolve)
        );

        await new Promise(resolve =>
            requestAnimationFrame(resolve)
        );

        await new Promise(resolve =>
            setTimeout(resolve, 300)
        );


        /* -------------------------------------------------
           CREATE PDF
        ------------------------------------------------- */

        setLoading(
            true,
            "Creating PDF..."
        );

        const pdf = await createPDF(rendered);


        /* -------------------------------------------------
           SAVE PDF
        ------------------------------------------------- */

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


        /* -------------------------------------------------
           CLEANUP
        ------------------------------------------------- */

        rendered.remove();

        setLoading(false);

    } catch (error) {

        console.error("PDF conversion error:", error);

        setLoading(false);

        showError(
            error && error.message
                ? error.message
                : "Conversion failed. Please try again."
        );
    }
});


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


    /* -------------------------------------------------
       Notebook title
    ------------------------------------------------- */

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

        documentElement.appendChild(title);
    }


    /* -------------------------------------------------
       Cells
    ------------------------------------------------- */

    notebook.cells.forEach((cell, index) => {

        const cellElement =
            document.createElement("section");

        cellElement.className =
            "notebook-cell";

        cellElement.dataset.cellIndex =
            index;


        /* =============================================
           MARKDOWN CELL
        ============================================= */

        if (cell.cell_type === "markdown") {

            const markdown =
                sourceToString(cell.source);

            let html =
                window.marked.parse(markdown);

            html =
                window.DOMPurify.sanitize(
                    html,
                    {
                        USE_PROFILES: {
                            html: true
                        }
                    }
                );

            cellElement.innerHTML =
                `<div class="markdown-cell">
                    ${html}
                </div>`;
        }


        /* =============================================
           CODE CELL
        ============================================= */

        else if (cell.cell_type === "code") {

            const source =
                sourceToString(cell.source);

            if (source.trim()) {

                const pre =
                    document.createElement("pre");

                pre.className = "code";

                const code =
                    document.createElement("code");

                code.textContent =
                    source;

                pre.appendChild(code);

                cellElement.appendChild(pre);
            }


            /* -----------------------------------------
               Outputs
            ----------------------------------------- */

            if (Array.isArray(cell.outputs)) {

                cell.outputs.forEach(output => {

                    const outputElement =
                        renderOutput(output);

                    if (outputElement) {

                        cellElement.appendChild(
                            outputElement
                        );
                    }
                });
            }
        }


        /* =============================================
           RAW CELL
        ============================================= */

        else if (cell.cell_type === "raw") {

            const raw =
                sourceToString(cell.source);

            const pre =
                document.createElement("pre");

            pre.className = "raw-cell";

            pre.textContent =
                raw;

            cellElement.appendChild(pre);
        }


        documentElement.appendChild(
            cellElement
        );
    });


    container.appendChild(
        documentElement
    );

    document.body.appendChild(
        container
    );


    /* -------------------------------------------------
       MathJax
    ------------------------------------------------- */

    if (
        window.MathJax &&
        typeof window.MathJax.typesetPromise === "function"
    ) {

        try {

            await window.MathJax.typesetPromise([
                container
            ]);

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
   OUTPUT RENDERING
========================================================= */

function renderOutput(output) {

    if (!output) {
        return null;
    }

    const wrapper =
        document.createElement("div");

    wrapper.className = "output";


    /* -------------------------------------------------
       STREAM
    ------------------------------------------------- */

    if (output.output_type === "stream") {

        const text =
            sourceToString(output.text);

        const pre =
            document.createElement("pre");

        pre.className =
            "output-stream";

        pre.textContent =
            text;

        wrapper.appendChild(pre);

        return wrapper;
    }


    /* -------------------------------------------------
       ERROR
    ------------------------------------------------- */

    if (output.output_type === "error") {

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
            `${output.ename || "Error"}: ${
                output.evalue || ""
            }`;

        wrapper.appendChild(pre);

        return wrapper;
    }


    /* -------------------------------------------------
       DISPLAY DATA / EXECUTE RESULT
    ------------------------------------------------- */

    if (
        output.output_type === "display_data" ||
        output.output_type === "execute_result"
    ) {

        const data =
            output.data || {};


        /* ---------------------------------------------
           PNG
        --------------------------------------------- */

        if (data["image/png"]) {

            const img =
                document.createElement("img");

            img.className =
                "output-image";

            img.src =
                "data:image/png;base64," +
                cleanBase64(data["image/png"]);

            img.alt =
                "Notebook output";

            wrapper.appendChild(img);

            return wrapper;
        }


        /* ---------------------------------------------
           JPEG
        --------------------------------------------- */

        if (data["image/jpeg"]) {

            const img =
                document.createElement("img");

            img.className =
                "output-image";

            img.src =
                "data:image/jpeg;base64," +
                cleanBase64(data["image/jpeg"]);

            img.alt =
                "Notebook output";

            wrapper.appendChild(img);

            return wrapper;
        }


        /* ---------------------------------------------
           SVG
        --------------------------------------------- */

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
                document.createElement("div");

            div.className =
                "output-svg";

            div.innerHTML =
                svg;

            wrapper.appendChild(div);

            return wrapper;
        }


        /* ---------------------------------------------
           HTML
        --------------------------------------------- */

        if (data["text/html"]) {

            const html =
                window.DOMPurify.sanitize(
                    sourceToString(
                        data["text/html"]
                    )
                );

            const div =
                document.createElement("div");

            div.className =
                "output-html";

            div.innerHTML =
                html;

            wrapper.appendChild(div);

            return wrapper;
        }


        /* ---------------------------------------------
           Plain text
        --------------------------------------------- */

        if (data["text/plain"]) {

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
    }


    return null;
}


/* =========================================================
   CLEAN BASE64
========================================================= */

function cleanBase64(value) {

    if (Array.isArray(value)) {
        value = value.join("");
    }

    if (typeof value !== "string") {
        return "";
    }

    return value.replace(/\s/g, "");
}


/* =========================================================
   WAIT FOR IMAGES
========================================================= */

async function waitForImages(container) {

    const images =
        Array.from(
            container.querySelectorAll("img")
        );

    if (images.length === 0) {
        return;
    }

    await Promise.all(
        images.map(img => {

            if (img.complete) {
                return Promise.resolve();
            }

            return new Promise(resolve => {

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
            });
        })
    );
}


/* =========================================================
   WAIT FOR MATHJAX
========================================================= */

async function waitForMath(container) {

    if (
        !window.MathJax ||
        !window.MathJax.startup
    ) {
        return;
    }

    try {

        if (window.MathJax.startup.promise) {
            await window.MathJax.startup.promise;
        }

        if (
            typeof window.MathJax.typesetPromise ===
            "function"
        ) {

            await window.MathJax.typesetPromise([
                container
            ]);
        }

    } catch (error) {

        console.warn(
            "MathJax wait warning:",
            error
        );
    }
}


/* =========================================================
   CREATE PDF
   CHROME-SAFE CHUNKED RENDERING
========================================================= */

async function createPDF(element) {

    if (!element) {
        throw new Error(
            "PDF render element not found."
        );
    }


    if (!window.jspdf) {
        throw new Error(
            "jsPDF is not loaded."
        );
    }


    if (!window.html2canvas) {
        throw new Error(
            "html2canvas is not loaded."
        );
    }


    const { jsPDF } =
        window.jspdf;


    /* -------------------------------------------------
       Force stable layout
    ------------------------------------------------- */

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


    /* -------------------------------------------------
       Allow browser to paint
    ------------------------------------------------- */

    await new Promise(resolve =>
        requestAnimationFrame(resolve)
    );

    await new Promise(resolve =>
        requestAnimationFrame(resolve)
    );


    /* -------------------------------------------------
       Measure document
    ------------------------------------------------- */

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


    console.log(
        "PDF dimensions:",
        totalWidth,
        totalHeight
    );


    /* -------------------------------------------------
       Create PDF
    ------------------------------------------------- */

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
     * IMPORTANT:
     *
     * Never render the whole notebook into one
     * giant canvas.
     *
     * Chrome can return blank canvases when the
     * DOM becomes very tall.
     */

    const chunkHeight = 900;

    const scale = 1.5;


    let currentY = 0;
    let pageNumber = 0;


    /* =================================================
       PROCESS CHUNKS
    ================================================= */

    while (
        currentY < totalHeight
    ) {

        const remainingHeight =
            totalHeight - currentY;

        const captureHeight =
            Math.min(
                chunkHeight,
                remainingHeight
            );


        /* ---------------------------------------------
           Create isolated wrapper
        --------------------------------------------- */

        const wrapper =
            document.createElement("div");

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


        /* ---------------------------------------------
           Clone notebook
        --------------------------------------------- */

        const clone =
            element.cloneNode(true);

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


        /* ---------------------------------------------
           Allow Chrome to paint clone
        --------------------------------------------- */

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


        /* ---------------------------------------------
           Capture chunk
        --------------------------------------------- */

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

        } catch (error) {

            console.error(
                "html2canvas error:",
                error
            );

            throw new Error(
                "Chrome could not render part of the notebook. Try refreshing the page and converting again."
            );

        } finally {

            wrapper.remove();
        }


        /* ---------------------------------------------
           Validate canvas
        --------------------------------------------- */

        if (
            !canvas ||
            canvas.width === 0 ||
            canvas.height === 0
        ) {

            throw new Error(
                `Chrome produced an empty canvas for section ${
                    pageNumber + 1
                }.`
            );
        }


        /* ---------------------------------------------
           Determine PDF slice size
        --------------------------------------------- */

        const pixelsPerPdfPage =
            (
                usableHeight /
                usableWidth
            ) * canvas.width;


        let sourceY = 0;


        /* =================================================
           SPLIT CHUNK INTO PDF PAGES
        ================================================= */

        while (
            sourceY < canvas.height
        ) {

            const sourceHeight =
                Math.min(
                    pixelsPerPdfPage,
                    canvas.height - sourceY
                );


            /* -----------------------------------------
               Page canvas
            ----------------------------------------- */

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


            /* -----------------------------------------
               Convert to JPEG
            ----------------------------------------- */

            const imageData =
                pageCanvas.toDataURL(
                    "image/jpeg",
                    0.92
                );


            /* -----------------------------------------
               Add PDF page
            ----------------------------------------- */

            if (pageNumber > 0) {
                pdf.addPage();
            }


            const imageHeight =
                (
                    sourceHeight /
                    canvas.width
                ) * usableWidth;


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


            /* -----------------------------------------
               Give Chrome time between pages
            ----------------------------------------- */

            await new Promise(resolve =>
                requestAnimationFrame(resolve)
            );


            /* -----------------------------------------
               Free page canvas
            ----------------------------------------- */

            pageCanvas.width = 1;
            pageCanvas.height = 1;
        }


        /* ---------------------------------------------
           Move to next notebook chunk
        --------------------------------------------- */

        currentY +=
            captureHeight;


        /* ---------------------------------------------
           Free large canvas
        --------------------------------------------- */

        canvas.width = 1;
        canvas.height = 1;


        /* ---------------------------------------------
           Small Chrome memory pause
        --------------------------------------------- */

        await new Promise(resolve =>
            setTimeout(resolve, 30)
        );


        /* ---------------------------------------------
           Update progress
        --------------------------------------------- */

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


    /* -------------------------------------------------
       Final validation
    ------------------------------------------------- */

    if (pageNumber === 0) {

        throw new Error(
            "No PDF pages were generated."
        );
    }


    return pdf;
}


/* =========================================================
   LOADING UI
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
   ERROR UI
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
