// ============================================================
// IPYNB → PDF
// Faster cell-by-cell PDF renderer
// ============================================================

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
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


// ============================================================
// FILE INPUT
// ============================================================

fileInput.addEventListener("change", function () {
    if (this.files && this.files.length > 0) {
        handleFile(this.files[0]);
    }
});


// ============================================================
// DRAG & DROP
// ============================================================

["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add("drag-over");
    });
});

["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("drag-over");
    });
});

dropZone.addEventListener("drop", event => {
    const files = event.dataTransfer.files;

    if (files && files.length > 0) {
        handleFile(files[0]);
    }
});


// ============================================================
// REMOVE FILE
// ============================================================

removeFile.addEventListener("click", () => {
    selectedFile = null;
    fileInput.value = "";

    fileInfo.classList.add("hidden");
    convertButton.disabled = true;

    hideError();
    hideStatus();
});


// ============================================================
// FILE HANDLING
// ============================================================

function handleFile(file) {
    hideError();

    if (!file.name.toLowerCase().endsWith(".ipynb")) {
        showError("Please select a valid .ipynb file.");
        return;
    }

    selectedFile = file;

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    fileInfo.classList.remove("hidden");
    convertButton.disabled = false;
}


// ============================================================
// CONVERT BUTTON
// ============================================================

convertButton.addEventListener("click", convertNotebook);


// ============================================================
// MAIN CONVERSION
// ============================================================

async function convertNotebook() {
    if (!selectedFile) {
        return;
    }

    hideError();

    try {
        convertButton.disabled = true;

        showStatus(
            "Preparing notebook...",
            "Reading your .ipynb file"
        );

        checkLibraries();

        const text = await selectedFile.text();

        let notebook;

        try {
            notebook = JSON.parse(text);
        } catch (error) {
            throw new Error(
                "The selected file is not valid Jupyter Notebook JSON."
            );
        }

        if (
            !notebook ||
            !Array.isArray(notebook.cells)
        ) {
            throw new Error(
                "This file does not contain a valid notebook cell list."
            );
        }

        showStatus(
            "Rendering notebook...",
            `${notebook.cells.length} cells found`
        );

        await renderNotebook(notebook);

        await waitForMath();

        showStatus(
            "Creating PDF...",
            "Building the document"
        );

        const pdf = await buildPDF();

        showStatus(
            "Finishing...",
            "Preparing your download"
        );

        const outputName =
            selectedFile.name.replace(
                /\.ipynb$/i,
                ""
            ) + ".pdf";

        pdf.save(outputName);

        showStatus(
            "Done!",
            `${outputName} has been downloaded`
        );

        await sleep(1500);

        hideStatus();

    } catch (error) {
        console.error(error);

        showError(
            error && error.message
                ? error.message
                : "An unexpected error occurred while creating the PDF."
        );

        hideStatus();

    } finally {
        convertButton.disabled = false;
    }
}


// ============================================================
// LIBRARY CHECK
// ============================================================

function checkLibraries() {
    if (!window.marked) {
        throw new Error(
            "Markdown renderer failed to load."
        );
    }

    if (!window.DOMPurify) {
        throw new Error(
            "HTML sanitizer failed to load."
        );
    }

    if (!window.html2canvas) {
        throw new Error(
            "HTML renderer failed to load."
        );
    }

    if (!window.jspdf) {
        throw new Error(
            "PDF library failed to load."
        );
    }
}


// ============================================================
// RENDER NOTEBOOK
// ============================================================

async function renderNotebook(notebook) {
    pdfRenderContainer.innerHTML = "";

    const documentElement =
        document.createElement("div");

    documentElement.className =
        "notebook-document";

    pdfRenderContainer.appendChild(documentElement);

    for (let i = 0; i < notebook.cells.length; i++) {
        const cell = notebook.cells[i];

        showStatus(
            "Rendering notebook...",
            `Cell ${i + 1} of ${notebook.cells.length}`
        );

        const cellElement =
            notebookCellToHTML(cell, i);

        documentElement.appendChild(cellElement);

        // Give the browser a chance to paint.
        await nextFrame();

        // Render MathJax for this cell if necessary.
        if (
            window.MathJax &&
            typeof window.MathJax.typesetPromise === "function"
        ) {
            try {
                await window.MathJax.typesetPromise(
                    [cellElement]
                );
            } catch (error) {
                console.warn(
                    "MathJax rendering warning:",
                    error
                );
            }
        }

        await waitForImages(cellElement);
    }

    await nextFrame();
}


// ============================================================
// NOTEBOOK CELL → HTML
// ============================================================

function notebookCellToHTML(cell, index) {
    const wrapper =
        document.createElement("section");

    wrapper.className =
        "notebook-cell";

    wrapper.dataset.cellIndex = index;

    const cellType = cell.cell_type;

    if (cellType === "markdown") {
        wrapper.innerHTML =
            renderMarkdown(
                sourceToString(cell.source)
            );

        return wrapper;
    }

    if (cellType === "raw") {
        const raw =
            document.createElement("pre");

        raw.className = "raw-cell";

        raw.textContent =
            sourceToString(cell.source);

        wrapper.appendChild(raw);

        return wrapper;
    }

    if (cellType === "code") {
        renderCodeCell(wrapper, cell);
        return wrapper;
    }

    wrapper.textContent =
        sourceToString(cell.source);

    return wrapper;
}


// ============================================================
// MARKDOWN
// ============================================================

function renderMarkdown(markdown) {
    const rawHTML =
        window.marked.parse(markdown || "");

    return window.DOMPurify.sanitize(
        rawHTML,
        {
            USE_PROFILES: {
                html: true
            }
        }
    );
}


// ============================================================
// CODE CELL
// ============================================================

function renderCodeCell(wrapper, cell) {
    const input =
        document.createElement("div");

    input.className =
        "code-input";

    const prompt =
        document.createElement("div");

    prompt.className =
        "cell-prompt";

    prompt.textContent =
        cell.execution_count != null
            ? `In [${cell.execution_count}]:`
            : "In [ ]:";

    const code =
        document.createElement("pre");

    const codeElement =
        document.createElement("code");

    codeElement.textContent =
        sourceToString(cell.source);

    code.appendChild(codeElement);

    input.appendChild(prompt);
    input.appendChild(code);

    wrapper.appendChild(input);


    // Outputs
    if (
        Array.isArray(cell.outputs)
    ) {
        for (const output of cell.outputs) {
            const outputElement =
                renderOutput(output);

            if (outputElement) {
                wrapper.appendChild(
                    outputElement
                );
            }
        }
    }
}


// ============================================================
// OUTPUT RENDERING
// ============================================================

function renderOutput(output) {
    if (!output) {
        return null;
    }

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "cell-output";


    // ------------------------------
    // Stream output
    // ------------------------------

    if (
        output.output_type === "stream"
    ) {
        const pre =
            document.createElement("pre");

        pre.className =
            "stream-output";

        pre.textContent =
            sourceToString(output.text);

        wrapper.appendChild(pre);

        return wrapper;
    }


    // ------------------------------
    // Error output
    // ------------------------------

    if (
        output.output_type === "error"
    ) {
        const pre =
            document.createElement("pre");

        pre.className =
            "error-output";

        pre.textContent =
            Array.isArray(output.traceback)
                ? output.traceback.join("\n")
                : [
                    output.ename || "Error",
                    output.evalue || ""
                ].join(": ");

        wrapper.appendChild(pre);

        return wrapper;
    }


    // ------------------------------
    // display_data / execute_result
    // ------------------------------

    if (
        output.output_type === "display_data" ||
        output.output_type === "execute_result"
    ) {
        return renderMimeBundle(
            output.data || {},
            wrapper
        );
    }


    return null;
}


// ============================================================
// MIME DATA
// ============================================================

function renderMimeBundle(data, wrapper) {

    // Prefer HTML
    if (data["text/html"]) {
        const html =
            sourceToString(data["text/html"]);

        const sanitized =
            window.DOMPurify.sanitize(
                html
            );

        const htmlContainer =
            document.createElement("div");

        htmlContainer.className =
            "output-html";

        htmlContainer.innerHTML =
            sanitized;

        wrapper.appendChild(
            htmlContainer
        );

        return wrapper;
    }


    // PNG
    if (data["image/png"]) {
        const img =
            document.createElement("img");

        img.className =
            "output-image";

        img.src =
            "data:image/png;base64," +
            sourceToString(
                data["image/png"]
            );

        wrapper.appendChild(img);

        return wrapper;
    }


    // JPEG
    if (data["image/jpeg"]) {
        const img =
            document.createElement("img");

        img.className =
            "output-image";

        img.src =
            "data:image/jpeg;base64," +
            sourceToString(
                data["image/jpeg"]
            );

        wrapper.appendChild(img);

        return wrapper;
    }


    // SVG
    if (data["image/svg+xml"]) {
        const svg =
            sourceToString(
                data["image/svg+xml"]
            );

        const container =
            document.createElement("div");

        container.className =
            "output-svg";

        container.innerHTML =
            window.DOMPurify.sanitize(
                svg,
                {
                    USE_PROFILES: {
                        svg: true
                    }
                }
            );

        wrapper.appendChild(container);

        return wrapper;
    }


    // Plain text
    if (data["text/plain"]) {
        const pre =
            document.createElement("pre");

        pre.className =
            "plain-output";

        pre.textContent =
            sourceToString(
                data["text/plain"]
            );

        wrapper.appendChild(pre);

        return wrapper;
    }


    return null;
}


// ============================================================
// BUILD PDF
// ============================================================

async function buildPDF() {
    const { jsPDF } = window.jspdf;

    const PAGE_WIDTH = 210;
    const PAGE_HEIGHT = 297;

    const MARGIN = 10;

    const CONTENT_WIDTH =
        PAGE_WIDTH - MARGIN * 2;

    const CONTENT_HEIGHT =
        PAGE_HEIGHT - MARGIN * 2;


    // Width used for HTML rendering.
    // 794px ≈ A4 at 96 DPI.
    const RENDER_WIDTH = 794;

    // Moderate scale gives good quality
    // without creating gigantic canvases.
    const SCALE = 1.35;


    const documentElement =
        pdfRenderContainer.querySelector(
            ".notebook-document"
        );

    if (!documentElement) {
        throw new Error(
            "Notebook rendering failed."
        );
    }


    const cells =
        Array.from(
            documentElement.children
        );

    if (cells.length === 0) {
        throw new Error(
            "The notebook appears to be empty."
        );
    }


    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    let pageNumber = 0;

    let currentY = MARGIN;


    // Convert rendered pixels to PDF mm.
    const pixelsPerMm =
        (RENDER_WIDTH * SCALE) /
        CONTENT_WIDTH;


    for (
        let i = 0;
        i < cells.length;
        i++
    ) {
        const cell =
            cells[i];


        showStatus(
            "Creating PDF...",
            `Processing cell ${i + 1} of ${cells.length}`
        );


        // Make sure cell is visible to html2canvas
        // but remains completely outside the UI.
        const renderWrapper =
            document.createElement("div");

        renderWrapper.style.position =
            "fixed";

        renderWrapper.style.left =
            "-100000px";

        renderWrapper.style.top =
            "0";

        renderWrapper.style.width =
            `${RENDER_WIDTH}px`;

        renderWrapper.style.background =
            "#ffffff";

        renderWrapper.style.padding =
            "0";

        renderWrapper.style.margin =
            "0";

        renderWrapper.style.overflow =
            "visible";


        // Clone ONLY this cell.
        const clone =
            cell.cloneNode(true);

        clone.style.width =
            `${RENDER_WIDTH}px`;

        clone.style.margin =
            "0";

        clone.style.boxSizing =
            "border-box";


        renderWrapper.appendChild(
            clone
        );

        document.body.appendChild(
            renderWrapper
        );


        await nextFrame();


        let canvas = null;


        try {
            canvas =
                await html2canvas(
                    renderWrapper,
                    {
                        backgroundColor:
                            "#ffffff",

                        scale: SCALE,

                        width:
                            RENDER_WIDTH,

                        windowWidth:
                            RENDER_WIDTH,

                        useCORS:
                            true,

                        allowTaint:
                            false,

                        logging:
                            false,

                        imageTimeout:
                            10000,

                        foreignObjectRendering:
                            false
                    }
                );

        } finally {
            renderWrapper.remove();
        }


        if (
            !canvas ||
            canvas.width <= 0 ||
            canvas.height <= 0
        ) {
            continue;
        }


        // Height of this cell in PDF millimeters.
        const cellHeight =
            canvas.height /
            pixelsPerMm;


        // ----------------------------------------------------
        // If the cell doesn't fit, start a new page.
        // ----------------------------------------------------

        if (
            currentY > MARGIN &&
            currentY + cellHeight >
            PAGE_HEIGHT - MARGIN
        ) {
            pdf.addPage();

            pageNumber++;

            currentY = MARGIN;
        }


        // ----------------------------------------------------
        // If a single cell is taller than a page,
        // split its canvas vertically.
        // ----------------------------------------------------

        if (
            cellHeight >
            CONTENT_HEIGHT
        ) {
            await addTallCanvas(
                pdf,
                canvas,
                {
                    margin: MARGIN,
                    pageWidth: CONTENT_WIDTH,
                    pageHeight: CONTENT_HEIGHT,
                    pixelsPerMm
                }
            );

            pageNumber++;

            currentY =
                MARGIN;

        } else {

            // PNG keeps text/code sharper than JPEG.
            const imageData =
                canvas.toDataURL(
                    "image/png"
                );


            if (
                pageNumber === 0 &&
                currentY === MARGIN
            ) {
                // First page already exists.
            }


            pdf.addImage(
                imageData,
                "PNG",
                MARGIN,
                currentY,
                CONTENT_WIDTH,
                cellHeight,
                undefined,
                "FAST"
            );


            currentY +=
                cellHeight;


            // Small gap between cells.
            currentY += 3;
        }


        // Release canvas memory.
        canvas.width = 1;
        canvas.height = 1;

        canvas = null;


        // Let Chrome release memory.
        await nextFrame();

        if (i % 3 === 0) {
            await sleep(20);
        }
    }


    // Remove an empty trailing page situation.
    if (
        pdf.getNumberOfPages() > 1 &&
        currentY === MARGIN
    ) {
        pdf.deletePage(
            pdf.getNumberOfPages()
        );
    }


    return pdf;
}


// ============================================================
// HANDLE VERY TALL CELLS
// ============================================================

async function addTallCanvas(
    pdf,
    canvas,
    options
) {
    const {
        margin,
        pageWidth,
        pageHeight,
        pixelsPerMm
    } = options;


    const pagePixelHeight =
        Math.floor(
            pageHeight *
            pixelsPerMm
        );


    let sourceY = 0;

    let firstPart = true;


    while (
        sourceY < canvas.height
    ) {
        const sliceHeight =
            Math.min(
                pagePixelHeight,
                canvas.height - sourceY
            );


        const slice =
            document.createElement(
                "canvas"
            );

        slice.width =
            canvas.width;

        slice.height =
            sliceHeight;


        const context =
            slice.getContext(
                "2d"
            );


        context.drawImage(
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


        if (!firstPart) {
            pdf.addPage();
        }

        firstPart = false;


        const imageData =
            slice.toDataURL(
                "image/png"
            );


        const imageHeight =
            slice.height /
            pixelsPerMm;


        pdf.addImage(
            imageData,
            "PNG",
            margin,
            margin,
            pageWidth,
            imageHeight,
            undefined,
            "FAST"
        );


        slice.width = 1;
        slice.height = 1;


        sourceY +=
            sliceHeight;


        await nextFrame();
    }
}


// ============================================================
// WAIT FOR IMAGES
// ============================================================

async function waitForImages(
    element
) {
    const images =
        Array.from(
            element.querySelectorAll(
                "img"
            )
        );


    if (images.length === 0) {
        return;
    }


    await Promise.all(
        images.map(
            img =>
                new Promise(resolve => {

                    if (img.complete) {
                        resolve();
                        return;
                    }

                    img.onload =
                        resolve;

                    img.onerror =
                        resolve;
                })
        )
    );
}


// ============================================================
// WAIT FOR MATHJAX
// ============================================================

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
                "MathJax warning:",
                error
            );
        }
    }

    await nextFrame();
}


// ============================================================
// PAINT / FRAME HELPERS
// ============================================================

function nextFrame() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            resolve();
        });
    });
}


function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}


// ============================================================
// STATUS
// ============================================================

function showStatus(
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


function hideStatus() {
    status.classList.add(
        "hidden"
    );
}


// ============================================================
// ERRORS
// ============================================================

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


// ============================================================
// UTILITIES
// ============================================================

function sourceToString(source) {
    if (Array.isArray(source)) {
        return source.join("");
    }

    if (
        source === null ||
        source === undefined
    ) {
        return "";
    }

    return String(source);
}


function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(
            bytes / 1024
        ).toFixed(1)} KB`;
    }

    return `${(
        bytes /
        (1024 * 1024)
    ).toFixed(1)} MB`;
}
