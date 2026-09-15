"use strict";

/* =========================================================
   ELEMENTS
   ========================================================= */

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("notebook");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const removeFile = document.getElementById("removeFile");
const convertButton = document.getElementById("convertButton");
const status = document.getElementById("status");
const statusText = document.getElementById("statusText");
const errorBox = document.getElementById("error");

let selectedFile = null;


/* =========================================================
   FILE SELECTION
   ========================================================= */

dropZone.addEventListener("click", () => {
    fileInput.click();
});


fileInput.addEventListener("change", () => {

    if (fileInput.files.length > 0) {
        selectFile(fileInput.files[0]);
    }

});


/* =========================================================
   DRAG AND DROP
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

    if (event.dataTransfer.files.length > 0) {
        selectFile(event.dataTransfer.files[0]);
    }

});


/* =========================================================
   SELECT FILE
   ========================================================= */

function selectFile(file) {

    hideError();

    if (!file.name.toLowerCase().endsWith(".ipynb")) {

        showError("Please select a .ipynb file.");

        return;
    }

    selectedFile = file;

    fileName.textContent = file.name;

    fileInfo.classList.remove("hidden");

    dropZone.classList.add("hidden");

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
   CONVERT
   ========================================================= */

convertButton.addEventListener("click", async () => {

    if (!selectedFile) {
        return;
    }

    hideError();

    convertButton.disabled = true;

    status.classList.remove("hidden");

    try {

        /* ---------------------------------------------
           Check libraries
           --------------------------------------------- */

        if (!window.marked) {
            throw new Error(
                "Markdown library failed to load."
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


        /* ---------------------------------------------
           Read notebook
           --------------------------------------------- */

        statusText.textContent =
            "Reading notebook...";

        const text =
            await selectedFile.text();

        const notebook =
            JSON.parse(text);


        /* ---------------------------------------------
           Validate
           --------------------------------------------- */

        validateNotebook(notebook);


        /* ---------------------------------------------
           Render notebook
           --------------------------------------------- */

        statusText.textContent =
            "Rendering notebook...";

        const element =
            await notebookToHTML(notebook);


        /* ---------------------------------------------
           Wait for images
           --------------------------------------------- */

        statusText.textContent =
            "Loading images...";

        await waitForImages(element);


        /* ---------------------------------------------
           Wait for MathJax
           --------------------------------------------- */

        statusText.textContent =
            "Rendering equations...";

        await waitForMath();


        /* ---------------------------------------------
           Small delay to allow layout to settle
           --------------------------------------------- */

        await new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });


        /* ---------------------------------------------
           Generate PDF
           --------------------------------------------- */

        statusText.textContent =
            "Generating PDF...";

        const pdf =
            await createPDF(element);


        /* ---------------------------------------------
           Download
           --------------------------------------------- */

        const filename =
            selectedFile.name.replace(
                /\.ipynb$/i,
                ".pdf"
            );

        pdf.save(filename);


        statusText.textContent =
            "PDF downloaded successfully!";


        /* ---------------------------------------------
           Remove temporary HTML
           --------------------------------------------- */

        if (element && element.isConnected) {
            element.remove();
        }


    } catch (error) {

        console.error(error);

        showError(
            "Conversion failed: " +
            (error.message || error)
        );

    } finally {

        convertButton.disabled = false;

    }

});


/* =========================================================
   VALIDATE NOTEBOOK
   ========================================================= */

function validateNotebook(notebook) {

    if (!notebook || typeof notebook !== "object") {

        throw new Error(
            "Invalid notebook file."
        );

    }

    if (!Array.isArray(notebook.cells)) {

        throw new Error(
            "This file does not contain notebook cells."
        );

    }

}


/* =========================================================
   RENDER NOTEBOOK
   ========================================================= */

async function notebookToHTML(notebook) {

    const container =
        document.createElement("div");

    container.className =
        "pdf-render-container";


    const wrapper =
        document.createElement("div");

    wrapper.className =
        "notebook-document";


    /* ---------------------------------------------
       Notebook title
       --------------------------------------------- */

    if (notebook.metadata?.title) {

        const title =
            document.createElement("h1");

        title.className =
            "notebook-title";

        title.textContent =
            notebook.metadata.title;

        wrapper.appendChild(title);

    }


    /* ---------------------------------------------
       Notebook cells
       --------------------------------------------- */

    for (const cell of notebook.cells) {

        const cellElement =
            document.createElement("section");

        cellElement.className =
            "notebook-cell";


        /* =========================================
           MARKDOWN CELL
           ========================================= */

        if (cell.cell_type === "markdown") {

            const markdown =
                Array.isArray(cell.source)
                    ? cell.source.join("")
                    : (cell.source || "");


            const html =
                window.marked.parse(markdown);


            cellElement.innerHTML =
                window.DOMPurify.sanitize(html);


            wrapper.appendChild(
                cellElement
            );

            continue;
        }


        /* =========================================
           CODE CELL
           ========================================= */

        if (cell.cell_type === "code") {

            const source =
                Array.isArray(cell.source)
                    ? cell.source.join("")
                    : (cell.source || "");


            /* -------------------------------------
               Code
               ------------------------------------- */

            const code =
                document.createElement("pre");

            code.className =
                "code";


            const codeElement =
                document.createElement("code");

            codeElement.textContent =
                source;


            code.appendChild(codeElement);

            cellElement.appendChild(code);


            /* -------------------------------------
               Outputs
               ------------------------------------- */

            for (
                const output of
                (cell.outputs || [])
            ) {

                const outputElement =
                    renderOutput(output);


                if (outputElement) {

                    cellElement.appendChild(
                        outputElement
                    );

                }

            }


            wrapper.appendChild(
                cellElement
            );

        }

    }


    container.appendChild(wrapper);

    document.body.appendChild(container);


    /* ---------------------------------------------
       MathJax
       --------------------------------------------- */

    if (
        window.MathJax &&
        typeof window.MathJax.typesetPromise ===
        "function"
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
   RENDER OUTPUT
   ========================================================= */

function renderOutput(output) {

    const container =
        document.createElement("div");

    container.className =
        "output";


    const data =
        output?.data || {};


    /* =====================================================
       STREAM OUTPUT
       ===================================================== */

    if (output.output_type === "stream") {

        const text =
            Array.isArray(output.text)
                ? output.text.join("")
                : (output.text || "");


        const pre =
            document.createElement("pre");

        pre.textContent = text;

        container.appendChild(pre);

        return container;
    }


    /* =====================================================
       ERROR OUTPUT
       ===================================================== */

    if (output.output_type === "error") {

        const pre =
            document.createElement("pre");


        const traceback =
            Array.isArray(output.traceback)
                ? output.traceback.join("\n")
                : (
                    output.traceback ||
                    (
                        output.ename +
                        ": " +
                        output.evalue
                    )
                );


        pre.textContent =
            traceback;


        container.appendChild(pre);

        return container;
    }


    /* =====================================================
       TEXT OUTPUT
       ===================================================== */

    if (data["text/plain"]) {

        const text =
            Array.isArray(data["text/plain"])
                ? data["text/plain"].join("")
                : data["text/plain"];


        const pre =
            document.createElement("pre");

        pre.textContent =
            text;


        container.appendChild(pre);

    }


    /* =====================================================
       PNG IMAGE
       ===================================================== */

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


        container.appendChild(img);

    }


    /* =====================================================
       JPEG IMAGE
       ===================================================== */

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


        container.appendChild(img);

    }


    /* =====================================================
       SVG
       ===================================================== */

    if (data["image/svg+xml"]) {

        const svg =
            Array.isArray(data["image/svg+xml"])
                ? data["image/svg+xml"].join("")
                : data["image/svg+xml"];


        const safeSVG =
            window.DOMPurify.sanitize(
                svg,
                {
                    USE_PROFILES: {
                        svg: true,
                        svgFilters: true
                    }
                }
            );


        const wrapper =
            document.createElement("div");

        wrapper.innerHTML =
            safeSVG;


        const svgElement =
            wrapper.firstElementChild;


        if (svgElement) {

            svgElement.style.maxWidth =
                "100%";

            svgElement.style.height =
                "auto";


            container.appendChild(
                svgElement
            );

        }

    }


    /* =====================================================
       HTML OUTPUT
       ===================================================== */

    if (data["text/html"]) {

        const html =
            Array.isArray(data["text/html"])
                ? data["text/html"].join("")
                : data["text/html"];


        const safeHTML =
            window.DOMPurify.sanitize(html);


        const htmlContainer =
            document.createElement("div");


        htmlContainer.innerHTML =
            safeHTML;


        container.appendChild(
            htmlContainer
        );

    }


    /* =====================================================
       NOTHING TO SHOW
       ===================================================== */

    if (!container.hasChildNodes()) {
        return null;
    }


    return container;

}


/* =========================================================
   CLEAN BASE64
   ========================================================= */

function cleanBase64(data) {

    return String(data)
        .replace(/\s/g, "");

}


/* =========================================================
   WAIT FOR IMAGES
   ========================================================= */

async function waitForImages(container) {

    const images =
        [
            ...container.querySelectorAll("img")
        ];


    await Promise.all(

        images.map(img => {

            return new Promise(resolve => {

                if (img.complete) {

                    resolve();

                    return;
                }


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

async function waitForMath() {

    if (
        window.MathJax &&
        window.MathJax.startup &&
        window.MathJax.startup.promise
    ) {

        await window.MathJax.startup.promise;

    }

}


/* =========================================================
   CREATE PDF
   ========================================================= */

async function createPDF(element) {

    const { jsPDF } =
        window.jspdf;


    if (!element) {

        throw new Error(
            "PDF rendering element was not created."
        );

    }


    /* ---------------------------------------------
       Make sure the element has real dimensions
       --------------------------------------------- */

    element.style.width =
        "794px";

    element.style.display =
        "block";

    element.style.background =
        "#ffffff";


    /* Force browser layout */
    void element.offsetHeight;


    const width =
        element.scrollWidth;


    const height =
        element.scrollHeight;


    if (!width || !height) {

        throw new Error(
            "The notebook produced an empty rendering."
        );

    }


    /* ---------------------------------------------
       Render HTML to canvas
       --------------------------------------------- */

    const canvas =
        await window.html2canvas(
            element,
            {
                scale: 2,

                backgroundColor:
                    "#ffffff",

                useCORS: true,

                allowTaint: false,

                logging: false,

                imageTimeout: 30000,

                width: width,

                height: height,

                windowWidth: width,

                windowHeight: height,

                scrollX: 0,

                scrollY: 0
            }
        );


    if (
        !canvas ||
        !canvas.width ||
        !canvas.height
    ) {

        throw new Error(
            "The notebook could not be rendered."
        );

    }


    /* ---------------------------------------------
       Create PDF
       --------------------------------------------- */

    const pdf =
        new jsPDF({
            orientation: "portrait",

            unit: "mm",

            format: "a4",

            compress: true
        });


    const pageWidth =
        210;

    const pageHeight =
        297;

    const margin =
        10;


    const contentWidth =
        pageWidth - margin * 2;

    const contentHeight =
        pageHeight - margin * 2;


    /* ---------------------------------------------
       Calculate source height for one PDF page
       --------------------------------------------- */

    const sourcePageHeight =
        Math.floor(
            canvas.width *
            contentHeight /
            contentWidth
        );


    let sourceY =
        0;

    let pageNumber =
        0;


    /* ---------------------------------------------
       Slice canvas into pages
       --------------------------------------------- */

    while (sourceY < canvas.height) {

        const sliceHeight =
            Math.min(
                sourcePageHeight,
                canvas.height - sourceY
            );


        const pageCanvas =
            document.createElement("canvas");


        pageCanvas.width =
            canvas.width;

        pageCanvas.height =
            sliceHeight;


        const ctx =
            pageCanvas.getContext("2d");


        if (!ctx) {

            throw new Error(
                "Could not create PDF canvas."
            );

        }


        /* White background */

        ctx.fillStyle =
            "#ffffff";

        ctx.fillRect(
            0,
            0,
            pageCanvas.width,
            pageCanvas.height
        );


        /* Copy this page's portion */

        ctx.drawImage(
            canvas,

            0,
            sourceY,

            canvas.width,
            sliceHeight,

            0,
            0,

            canvas.width,
            sliceHeight
        );


        const imageData =
            pageCanvas.toDataURL(
                "image/jpeg",
                0.95
            );


        /* Add page after first page */

        if (pageNumber > 0) {
            pdf.addPage();
        }


        const renderedHeight =
            sliceHeight *
            contentWidth /
            canvas.width;


        pdf.addImage(
            imageData,

            "JPEG",

            margin,

            margin,

            contentWidth,

            renderedHeight,

            undefined,

            "FAST"
        );


        sourceY +=
            sliceHeight;

        pageNumber++;

    }


    return pdf;

}


/* =========================================================
   ERROR HANDLING
   ========================================================= */

function showError(message) {

    errorBox.textContent =
        message;

    errorBox.classList.remove(
        "hidden"
    );

}


function hideError() {

    errorBox.textContent = "";

    errorBox.classList.add(
        "hidden"
    );

}
