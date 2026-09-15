"use strict";


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");

const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");

const removeFileButton =
    document.getElementById("removeFile");

const convertButton =
    document.getElementById("convertButton");

const status =
    document.getElementById("status");

const statusTitle =
    document.getElementById("statusTitle");

const statusText =
    document.getElementById("statusText");

const errorBox =
    document.getElementById("errorBox");

const errorMessage =
    document.getElementById("errorMessage");

const pdfRenderContainer =
    document.getElementById("pdfRenderContainer");


/* =========================================================
   STATE
   ========================================================= */

let selectedFile = null;


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    if (!fileInput) {
        console.error("fileInput was not found.");
        return;
    }

    if (!dropZone) {
        console.error("dropZone was not found.");
        return;
    }

    setupFileInput();
    setupDragAndDrop();
    setupButtons();

});


/* =========================================================
   FILE INPUT
   ========================================================= */

function setupFileInput() {

    /*
        IMPORTANT:

        We intentionally DO NOT do:

            fileInput.click()

        from the drop-zone click handler.

        The HTML <label for="fileInput"> handles the
        Chrome file picker natively.
    */

    fileInput.addEventListener("change", (event) => {

        const file =
            event.target.files &&
            event.target.files[0];

        if (!file) {
            return;
        }

        handleFile(file);
    });

}


/* =========================================================
   DRAG & DROP
   ========================================================= */

function setupDragAndDrop() {

    [
        "dragenter",
        "dragover"
    ].forEach((eventName) => {

        dropZone.addEventListener(
            eventName,
            (event) => {

                event.preventDefault();
                event.stopPropagation();

                dropZone.classList.add("dragover");
            }
        );

    });


    [
        "dragleave",
        "drop"
    ].forEach((eventName) => {

        dropZone.addEventListener(
            eventName,
            (event) => {

                event.preventDefault();
                event.stopPropagation();

                dropZone.classList.remove("dragover");
            }
        );

    });


    dropZone.addEventListener(
        "drop",
        (event) => {

            const files =
                event.dataTransfer &&
                event.dataTransfer.files;

            if (!files || !files.length) {
                return;
            }

            handleFile(files[0]);
        }
    );

}


/* =========================================================
   BUTTONS
   ========================================================= */

function setupButtons() {

    removeFileButton.addEventListener(
        "click",
        removeSelectedFile
    );

    convertButton.addEventListener(
        "click",
        convertNotebook
    );

}


/* =========================================================
   HANDLE FILE
   ========================================================= */

function handleFile(file) {

    clearError();

    if (!file) {
        return;
    }


    /*
        Check extension.
    */

    const name =
        file.name.toLowerCase();

    if (!name.endsWith(".ipynb")) {

        showError(
            "Please select a Jupyter Notebook (.ipynb) file."
        );

        resetFileInput();

        return;
    }


    /*
        Basic size warning.
    */

    if (file.size > 50 * 1024 * 1024) {

        showError(
            "This notebook is larger than 50 MB. " +
            "Very large notebooks may require more browser memory."
        );

        resetFileInput();

        return;
    }


    selectedFile = file;


    /*
        Update UI.
    */

    fileName.textContent =
        file.name;

    fileSize.textContent =
        formatFileSize(file.size);

    fileInfo.classList.remove("hidden");

    convertButton.disabled = false;

}


/* =========================================================
   REMOVE FILE
   ========================================================= */

function removeSelectedFile() {

    selectedFile = null;

    resetFileInput();

    fileInfo.classList.add("hidden");

    convertButton.disabled = true;

    clearError();

}


/* =========================================================
   RESET INPUT
   ========================================================= */

function resetFileInput() {

    /*
        Resetting the input allows the user to select
        the same file again later.
    */

    fileInput.value = "";

}


/* =========================================================
   CONVERSION
   ========================================================= */

async function convertNotebook() {

    if (!selectedFile) {
        showError("Please select an .ipynb file first.");
        return;
    }


    /*
        Disable UI while converting.
    */

    convertButton.disabled = true;

    showStatus(
        "Reading notebook...",
        "Loading your .ipynb file"
    );


    try {

        verifyLibraries();


        /*
            Read notebook.
        */

        const notebook =
            await readNotebook(selectedFile);


        updateStatus(
            "Rendering notebook...",
            "Building the PDF layout"
        );


        /*
            Render HTML.
        */

        const html =
            notebookToHTML(notebook);


        pdfRenderContainer.innerHTML =
            html;


        /*
            Give browser time to insert DOM.
        */

        await nextFrame();
        await nextFrame();


        updateStatus(
            "Rendering formulas...",
            "Waiting for MathJax"
        );


        await waitForImages(
            pdfRenderContainer
        );

        await waitForMath();


        /*
            Chrome sometimes needs an additional paint
            cycle before html2canvas sees the complete DOM.
        */

        await nextFrame();
        await nextFrame();

        await sleep(300);


        updateStatus(
            "Creating PDF...",
            "Rendering notebook pages"
        );


        const pdf =
            await createPDF(
                pdfRenderContainer
            );


        updateStatus(
            "Finishing...",
            "Preparing your download"
        );


        const outputName =
            selectedFile.name
                .replace(/\.ipynb$/i, "")
            + ".pdf";


        pdf.save(outputName);


        updateStatus(
            "Done!",
            "Your PDF has been downloaded"
        );


        await sleep(1200);

        hideStatus();


    } catch (error) {

        console.error(error);

        hideStatus();

        showError(
            error && error.message
                ? error.message
                : "Could not convert the notebook."
        );

    } finally {

        convertButton.disabled =
            !selectedFile;

        /*
            Clean rendering area.
        */

        pdfRenderContainer.innerHTML = "";

    }

}


/* =========================================================
   VERIFY LIBRARIES
   ========================================================= */

function verifyLibraries() {

    if (
        !window.marked ||
        typeof window.marked.parse !== "function"
    ) {
        throw new Error(
            "Markdown library failed to load. Please refresh the page."
        );
    }


    if (!window.DOMPurify) {
        throw new Error(
            "DOMPurify failed to load. Please refresh the page."
        );
    }


    if (!window.html2canvas) {
        throw new Error(
            "html2canvas failed to load. Please refresh the page."
        );
    }


    if (
        !window.jspdf ||
        !window.jspdf.jsPDF
    ) {
        throw new Error(
            "jsPDF failed to load. Please refresh the page."
        );
    }

}


/* =========================================================
   READ NOTEBOOK
   ========================================================= */

function readNotebook(file) {

    return new Promise(
        (resolve, reject) => {

            const reader =
                new FileReader();


            reader.onload = () => {

                try {

                    const notebook =
                        JSON.parse(reader.result);

                    if (
                        !notebook ||
                        !Array.isArray(
                            notebook.cells
                        )
                    ) {

                        throw new Error(
                            "This does not appear to be a valid Jupyter Notebook."
                        );
                    }


                    resolve(notebook);

                } catch (error) {

                    reject(
                        new Error(
                            "Could not read the notebook JSON. " +
                            "Make sure the .ipynb file is valid."
                        )
                    );

                }

            };


            reader.onerror = () => {

                reject(
                    new Error(
                        "The browser could not read this file."
                    )
                );

            };


            reader.readAsText(file);

        }
    );

}


/* =========================================================
   NOTEBOOK → HTML
   ========================================================= */

function notebookToHTML(notebook) {

    let output = "";


    output += `
        <article class="notebook-document">
    `;


    /*
        Notebook title.
    */

    output += `
        <h1 class="notebook-title">
            ${escapeHTML(
                selectedFile
                    ? selectedFile.name.replace(
                        /\.ipynb$/i,
                        ""
                    )
                    : "Jupyter Notebook"
            )}
        </h1>
    `;


    /*
        Cells.
    */

    notebook.cells.forEach(
        (cell, index) => {

            const cellType =
                cell.cell_type || "";

            const source =
                Array.isArray(cell.source)
                    ? cell.source.join("")
                    : String(cell.source || "");


            /*
                Markdown cell
            */

            if (cellType === "markdown") {

                output += `
                    <section class="notebook-cell markdown-cell">
                        ${markdownToHTML(source)}
                    </section>
                `;

                return;
            }


            /*
                Code cell
            */

            if (cellType === "code") {

                output += `
                    <section class="notebook-cell code-cell">

                        <div class="code-label">
                            In [${escapeHTML(
                                cell.execution_count ??
                                index + 1
                            )}]
                        </div>

                        <pre class="code-block">${escapeHTML(
                            source
                        )}</pre>

                        ${
                            renderOutputs(
                                cell.outputs || []
                            )
                        }

                    </section>
                `;

                return;
            }


            /*
                Raw cell
            */

            if (cellType === "raw") {

                output += `
                    <section class="notebook-cell markdown-cell">
                        <pre class="code-block">${escapeHTML(
                            source
                        )}</pre>
                    </section>
                `;

            }

        }
    );


    output += `
        </article>
    `;


    return output;

}


/* =========================================================
   MARKDOWN
   ========================================================= */

function markdownToHTML(markdown) {

    const parsed =
        window.marked.parse(
            markdown || ""
        );


    /*
        Sanitize generated HTML.
    */

    return window.DOMPurify.sanitize(
        parsed
    );

}


/* =========================================================
   OUTPUTS
   ========================================================= */

function renderOutputs(outputs) {

    if (!Array.isArray(outputs)) {
        return "";
    }


    return outputs
        .map(renderOutput)
        .join("");

}


/* =========================================================
   SINGLE OUTPUT
   ========================================================= */

function renderOutput(output) {

    if (!output) {
        return "";
    }


    const outputType =
        output.output_type || "";


    /*
        Stream output
    */

    if (outputType === "stream") {

        const text =
            Array.isArray(output.text)
                ? output.text.join("")
                : String(output.text || "");

        return `
            <div class="output-cell">
                <div class="output-label">
                    Output
                </div>

                <div class="output-text">${escapeHTML(
                    text
                )}</div>
            </div>
        `;

    }


    /*
        Error output
    */

    if (outputType === "error") {

        const traceback =
            Array.isArray(output.traceback)
                ? output.traceback.join("\n")
                : "";


        return `
            <div class="output-cell">

                <div class="output-label">
                    Error
                </div>

                <div class="output-error">${escapeHTML(
                    traceback ||
                    (
                        String(
                            output.ename || ""
                        )
                        + "\n"
                        + String(
                            output.evalue || ""
                        )
                    )
                )}</div>

            </div>
        `;

    }


    /*
        display_data / execute_result
    */

    if (
        outputType === "display_data" ||
        outputType === "execute_result"
    ) {

        return renderMimeBundle(
            output.data || {},
            output.metadata || {}
        );

    }


    return "";

}


/* =========================================================
   MIME BUNDLE
   ========================================================= */

function renderMimeBundle(
    data,
    metadata
) {

    if (!data) {
        return "";
    }


    /*
        Prefer PNG.
    */

    if (data["image/png"]) {

        const src =
            Array.isArray(
                data["image/png"]
            )
                ? data["image/png"].join("")
                : data["image/png"];


        return `
            <div class="output-cell">

                <div class="output-label">
                    Output
                </div>

                <img
                    class="output-image"
                    src="data:image/png;base64,${src}"
                    alt="Notebook output"
                >

            </div>
        `;

    }


    /*
        JPEG
    */

    if (data["image/jpeg"]) {

        const src =
            Array.isArray(
                data["image/jpeg"]
            )
                ? data["image/jpeg"].join("")
                : data["image/jpeg"];


        return `
            <div class="output-cell">

                <div class="output-label">
                    Output
                </div>

                <img
                    class="output-image"
                    src="data:image/jpeg;base64,${src}"
                    alt="Notebook output"
                >

            </div>
        `;

    }


    /*
        SVG
    */

    if (data["image/svg+xml"]) {

        const svg =
            Array.isArray(
                data["image/svg+xml"]
            )
                ? data["image/svg+xml"].join("")
                : data["image/svg+xml"];


        const safeSVG =
            window.DOMPurify.sanitize(
                svg,
                {
                    USE_PROFILES: {
                        svg: true
                    }
                }
            );


        return `
            <div class="output-cell">

                <div class="output-label">
                    Output
                </div>

                <div class="output-html">
                    ${safeSVG}
                </div>

            </div>
        `;

    }


    /*
        HTML
    */

    if (data["text/html"]) {

        const html =
            Array.isArray(
                data["text/html"]
            )
                ? data["text/html"].join("")
                : data["text/html"];


        const safeHTML =
            window.DOMPurify.sanitize(
                html
            );


        return `
            <div class="output-cell">

                <div class="output-label">
                    Output
                </div>

                <div class="output-html">
                    ${safeHTML}
                </div>

            </div>
        `;

    }


    /*
        Plain text
    */

    if (data["text/plain"]) {

        const text =
            Array.isArray(
                data["text/plain"]
            )
                ? data["text/plain"].join("")
                : data["text/plain"];


        return `
            <div class="output-cell">

                <div class="output-label">
                    Output
                </div>

                <div class="output-text">${escapeHTML(
                    text
                )}</div>

            </div>
        `;

    }


    return "";

}


/* =========================================================
   CREATE PDF
   ========================================================= */

async function createPDF(container) {

    const {
        jsPDF
    } = window.jspdf;


    /*
        A4 dimensions in mm.
    */

    const pageWidth = 210;
    const pageHeight = 297;

    const margin = 10;

    const contentWidth =
        pageWidth - margin * 2;

    const contentHeight =
        pageHeight - margin * 2;


    /*
        Render width.

        794px is approximately A4 width at 96 DPI.
        Keeping this fixed avoids huge Chrome canvases.
    */

    const renderWidth = 794;

    container.style.width =
        `${renderWidth}px`;


    /*
        Measure document.
    */

    const documentElement =
        container.querySelector(
            ".notebook-document"
        );


    if (!documentElement) {

        throw new Error(
            "The notebook could not be rendered."
        );

    }


    const totalHeight =
        documentElement.scrollHeight;


    if (
        !totalHeight ||
        totalHeight < 10
    ) {

        throw new Error(
            "The notebook appears to be empty."
        );

    }


    /*
        PDF.
    */

    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    /*
        Chrome can struggle with very tall canvases.

        Instead of capturing the entire notebook at once,
        capture it in smaller chunks.
    */

    const chunkHeight = 900;

    const scale = 1.5;


    let currentY = 0;

    let pageNumber = 0;


    while (
        currentY < totalHeight
    ) {

        const remainingHeight =
            totalHeight - currentY;

        const currentChunkHeight =
            Math.min(
                chunkHeight,
                remainingHeight
            );


        /*
            Create a temporary wrapper.

            The notebook is shifted upward so html2canvas
            captures only the desired section.
        */

        const wrapper =
            document.createElement("div");


        wrapper.style.position =
            "absolute";

        wrapper.style.left = "0";
        wrapper.style.top = "0";

        wrapper.style.width =
            `${renderWidth}px`;

        wrapper.style.height =
            `${currentChunkHeight}px`;

        wrapper.style.overflow =
            "hidden";

        wrapper.style.background =
            "white";


        const clone =
            documentElement.cloneNode(true);


        clone.style.position =
            "absolute";

        clone.style.left = "0";

        clone.style.top =
            `${-currentY}px`;

        clone.style.width =
            `${renderWidth}px`;

        clone.style.margin = "0";


        wrapper.appendChild(clone);

        document.body.appendChild(wrapper);


        /*
            Wait for browser paint.
        */

        await nextFrame();


        /*
            Render chunk.
        */

        const canvas =
            await window.html2canvas(
                wrapper,
                {
                    backgroundColor: "#ffffff",

                    scale: scale,

                    useCORS: true,

                    allowTaint: false,

                    logging: false,

                    imageTimeout: 15000,

                    width: renderWidth,

                    height: currentChunkHeight,

                    windowWidth: renderWidth,

                    windowHeight: currentChunkHeight,

                    scrollX: 0,

                    scrollY: 0
                }
            );


        document.body.removeChild(
            wrapper
        );


        /*
            Determine how much of this canvas fits
            on one PDF page.

            Since the canvas chunk is smaller than a page
            in normal cases, this also prevents oversized
            images.
        */

        const pixelsPerMm =
            canvas.width /
            contentWidth;


        const maxCanvasHeight =
            Math.floor(
                contentHeight *
                pixelsPerMm
            );


        /*
            Slice this chunk if necessary.
        */

        let sliceY = 0;


        while (
            sliceY < canvas.height
        ) {

            const sliceHeight =
                Math.min(
                    maxCanvasHeight,
                    canvas.height - sliceY
                );


            const pageCanvas =
                document.createElement(
                    "canvas"
                );


            pageCanvas.width =
                canvas.width;

            pageCanvas.height =
                sliceHeight;


            const ctx =
                pageCanvas.getContext(
                    "2d"
                );


            ctx.fillStyle =
                "#ffffff";

            ctx.fillRect(
                0,
                0,
                pageCanvas.width,
                pageCanvas.height
            );


            ctx.drawImage(
                canvas,

                0,
                sliceY,

                canvas.width,
                sliceHeight,

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


            if (pageNumber > 0) {

                pdf.addPage();

            }


            const imageHeight =
                sliceHeight /
                pixelsPerMm;


            pdf.addImage(
                imageData,
                "JPEG",
                margin,
                margin,
                contentWidth,
                imageHeight,
                undefined,
                "FAST"
            );


            pageNumber++;

            sliceY += sliceHeight;


            /*
                Free memory.
            */

            pageCanvas.width = 1;
            pageCanvas.height = 1;


            await nextFrame();

        }


        /*
            Free the main chunk canvas.
        */

        canvas.width = 1;
        canvas.height = 1;


        currentY +=
            currentChunkHeight;


        /*
            Progress.
        */

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


        updateStatus(
            "Creating PDF...",
            `${progress}% complete`
        );


        /*
            Give Chrome a chance to release memory.
        */

        await sleep(30);

    }


    return pdf;

}


/* =========================================================
   WAIT FOR IMAGES
   ========================================================= */

async function waitForImages(container) {

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
        images.map(
            (image) => {

                if (image.complete) {
                    return Promise.resolve();
                }


                return new Promise(
                    (resolve) => {

                        image.addEventListener(
                            "load",
                            resolve,
                            {
                                once: true
                            }
                        );

                        image.addEventListener(
                            "error",
                            resolve,
                            {
                                once: true
                            }
                        );

                    }
                );

            }
        )
    );

}


/* =========================================================
   WAIT FOR MATHJAX
   ========================================================= */

async function waitForMath() {

    if (
        window.MathJax &&
        window.MathJax.typesetPromise
    ) {

        try {

            await window.MathJax.typesetPromise();

        } catch (error) {

            console.warn(
                "MathJax rendering warning:",
                error
            );

        }

    }

}


/* =========================================================
   STATUS
   ========================================================= */

function showStatus(
    title,
    text
) {

    statusTitle.textContent =
        title;

    statusText.textContent =
        text;

    status.classList.remove(
        "hidden"
    );

}


function updateStatus(
    title,
    text
) {

    statusTitle.textContent =
        title;

    statusText.textContent =
        text;

}


function hideStatus() {

    status.classList.add(
        "hidden"
    );

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


function clearError() {

    errorBox.classList.add(
        "hidden"
    );

    errorMessage.textContent =
        "";

}


/* =========================================================
   HELPERS
   ========================================================= */

function formatFileSize(bytes) {

    if (!bytes) {
        return "0 KB";
    }


    const units = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    const size =
        bytes /
        Math.pow(
            1024,
            index
        );


    return (
        Math.round(
            size * 100
        ) / 100
    )
    + " "
    + units[
        Math.min(
            index,
            units.length - 1
        )
    ];

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

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


/* =========================================================
   SLEEP
   ========================================================= */

function sleep(ms) {

    return new Promise(
        (resolve) => {

            setTimeout(
                resolve,
                ms
            );

        }
    );

}
