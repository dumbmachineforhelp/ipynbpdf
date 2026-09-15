// ============================================================
// IPYNB → PDF
// Stable A4 renderer for Chrome / Brave / Edge / Firefox
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
// SETTINGS
// ============================================================

// A4 dimensions at 96 CSS pixels / inch.
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

// PDF margins in mm.
const PDF_MARGIN = 10;

// Rendering resolution.
// 1.35 gives considerably better text than 1x without
// creating enormous canvases.
const RENDER_SCALE = 1.35;

// JPEG quality.
// Notebook pages are mostly text/code, so this is intentionally
// high enough to keep text clean while avoiding huge PDFs.
const JPEG_QUALITY = 0.94;


// ============================================================
// FILE INPUT
// ============================================================

fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length) {
        handleFile(fileInput.files[0]);
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

    if (files && files.length) {
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

    hideStatus();
    hideError();

    clearRenderContainer();
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
// CONVERT
// ============================================================

convertButton.addEventListener(
    "click",
    convertNotebook
);


// ============================================================
// MAIN CONVERSION
// ============================================================

async function convertNotebook() {
    if (!selectedFile) {
        return;
    }

    convertButton.disabled = true;

    hideError();

    try {
        checkLibraries();

        showStatus(
            "Preparing notebook...",
            "Reading your file"
        );

        const text =
            await selectedFile.text();

        let notebook;

        try {
            notebook = JSON.parse(text);
        } catch {
            throw new Error(
                "The selected file is not valid Jupyter Notebook JSON."
            );
        }

        if (
            !notebook ||
            !Array.isArray(notebook.cells)
        ) {
            throw new Error(
                "This file does not contain a valid Jupyter Notebook."
            );
        }

        if (notebook.cells.length === 0) {
            throw new Error(
                "The notebook does not contain any cells."
            );
        }

        // Build the notebook DOM ONCE.
        showStatus(
            "Rendering notebook...",
            "Building the document"
        );

        await renderNotebook(
            notebook
        );

        // MathJax is rendered once, not once per PDF page.
        showStatus(
            "Rendering equations...",
            "Finishing mathematical notation"
        );

        await typesetMath();

        await waitForImages(
            pdfRenderContainer
        );

        await waitForPaint();

        // Build PDF.
        showStatus(
            "Creating PDF...",
            "Rendering pages"
        );

        const pdf =
            await createPDF();

        const outputName =
            selectedFile.name.replace(
                /\.ipynb$/i,
                ""
            ) + ".pdf";

        showStatus(
            "Downloading...",
            outputName
        );

        // Let the browser finish the current paint cycle
        // before triggering the download.
        await sleep(100);

        pdf.save(outputName);

        showStatus(
            "Done!",
            "Your PDF has been downloaded."
        );

        await sleep(1200);

        hideStatus();

    } catch (error) {
        console.error(
            "IPYNB → PDF error:",
            error
        );

        showError(
            error?.message ||
            "Something went wrong while creating the PDF."
        );

        hideStatus();

    } finally {
        convertButton.disabled = false;

        // Important: don't leave a large hidden DOM behind.
        clearRenderContainer();
    }
}


// ============================================================
// LIBRARIES
// ============================================================

function checkLibraries() {
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
}


// ============================================================
// NOTEBOOK → HTML
// ============================================================

async function renderNotebook(
    notebook
) {
    clearRenderContainer();

    const documentElement =
        document.createElement("div");

    documentElement.className =
        "notebook-document";

    documentElement.style.width =
        `${A4_WIDTH_PX}px`;

    documentElement.style.boxSizing =
        "border-box";

    documentElement.style.background =
        "#ffffff";

    pdfRenderContainer.appendChild(
        documentElement
    );


    for (
        let i = 0;
        i < notebook.cells.length;
        i++
    ) {
        const cell =
            notebook.cells[i];

        showStatus(
            "Rendering notebook...",
            `Cell ${i + 1} of ${notebook.cells.length}`
        );

        const cellElement =
            renderCell(
                cell,
                i
            );

        documentElement.appendChild(
            cellElement
        );
    }

    await waitForImages(
        documentElement
    );

    await waitForPaint();
}


// ============================================================
// CELL RENDERING
// ============================================================

function renderCell(
    cell,
    index
) {
    const wrapper =
        document.createElement("section");

    wrapper.className =
        "notebook-cell";

    wrapper.dataset.cellIndex =
        index;


    if (
        cell.cell_type === "markdown"
    ) {
        wrapper.innerHTML =
            renderMarkdown(
                sourceToString(
                    cell.source
                )
            );

        return wrapper;
    }


    if (
        cell.cell_type === "raw"
    ) {
        const pre =
            document.createElement("pre");

        pre.className =
            "raw-cell";

        pre.textContent =
            sourceToString(
                cell.source
            );

        wrapper.appendChild(pre);

        return wrapper;
    }


    if (
        cell.cell_type === "code"
    ) {
        renderCodeCell(
            wrapper,
            cell
        );

        return wrapper;
    }


    wrapper.textContent =
        sourceToString(
            cell.source
        );

    return wrapper;
}


// ============================================================
// MARKDOWN
// ============================================================

function renderMarkdown(
    markdown
) {
    const html =
        window.marked.parse(
            markdown || ""
        );

    return window.DOMPurify.sanitize(
        html
    );
}


// ============================================================
// CODE CELL
// ============================================================

function renderCodeCell(
    wrapper,
    cell
) {
    const input =
        document.createElement("div");

    input.className =
        "code-input";


    const prompt =
        document.createElement("div");

    prompt.className =
        "cell-prompt";

    prompt.textContent =
        cell.execution_count !== null &&
        cell.execution_count !== undefined
            ? `In [${cell.execution_count}]:`
            : "In [ ]:";


    const code =
        document.createElement("pre");

    const codeElement =
        document.createElement("code");

    codeElement.textContent =
        sourceToString(
            cell.source
        );

    code.appendChild(
        codeElement
    );

    input.appendChild(
        prompt
    );

    input.appendChild(
        code
    );

    wrapper.appendChild(
        input
    );


    if (
        Array.isArray(
            cell.outputs
        )
    ) {
        for (
            const output of cell.outputs
        ) {
            const outputElement =
                renderOutput(
                    output
                );

            if (outputElement) {
                wrapper.appendChild(
                    outputElement
                );
            }
        }
    }
}


// ============================================================
// OUTPUT
// ============================================================

function renderOutput(
    output
) {
    if (!output) {
        return null;
    }

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "cell-output";


    // ------------------------------
    // stdout / stderr
    // ------------------------------

    if (
        output.output_type === "stream"
    ) {
        const pre =
            document.createElement("pre");

        pre.className =
            "stream-output";

        pre.textContent =
            sourceToString(
                output.text
            );

        wrapper.appendChild(
            pre
        );

        return wrapper;
    }


    // ------------------------------
    // Error
    // ------------------------------

    if (
        output.output_type === "error"
    ) {
        const pre =
            document.createElement("pre");

        pre.className =
            "error-output";

        if (
            Array.isArray(
                output.traceback
            )
        ) {
            pre.textContent =
                output.traceback.join(
                    "\n"
                );
        } else {
            pre.textContent =
                `${output.ename || "Error"}: ${
                    output.evalue || ""
                }`;
        }

        wrapper.appendChild(
            pre
        );

        return wrapper;
    }


    // ------------------------------
    // Rich output
    // ------------------------------

    if (
        output.output_type ===
            "display_data" ||
        output.output_type ===
            "execute_result"
    ) {
        return renderMime(
            output.data || {},
            wrapper
        );
    }


    return null;
}


// ============================================================
// MIME DATA
// ============================================================

function renderMime(
    data,
    wrapper
) {
    // HTML
    if (data["text/html"]) {
        const container =
            document.createElement("div");

        container.className =
            "output-html";

        container.innerHTML =
            window.DOMPurify.sanitize(
                sourceToString(
                    data["text/html"]
                )
            );

        wrapper.appendChild(
            container
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

        wrapper.appendChild(
            img
        );

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

        wrapper.appendChild(
            img
        );

        return wrapper;
    }


    // SVG
    if (data["image/svg+xml"]) {
        const container =
            document.createElement("div");

        container.className =
            "output-svg";

        container.innerHTML =
            window.DOMPurify.sanitize(
                sourceToString(
                    data["image/svg+xml"]
                ),
                {
                    USE_PROFILES: {
                        svg: true
                    }
                }
            );

        wrapper.appendChild(
            container
        );

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

        wrapper.appendChild(
            pre
        );

        return wrapper;
    }


    return null;
}


// ============================================================
// PDF CREATION
// ============================================================

async function createPDF() {
    const { jsPDF } =
        window.jspdf;


    // --------------------------------------------------------
    // Create PDF at A4.
    // --------------------------------------------------------

    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    const documentElement =
        pdfRenderContainer.querySelector(
            ".notebook-document"
        );

    if (!documentElement) {
        throw new Error(
            "Nothing was rendered for the PDF."
        );
    }


    // --------------------------------------------------------
    // Determine the actual document height.
    // --------------------------------------------------------

    const totalHeight =
        Math.ceil(
            documentElement.scrollHeight
        );


    if (totalHeight <= 0) {
        throw new Error(
            "The notebook appears to be empty."
        );
    }


    // --------------------------------------------------------
    // Convert A4 PDF dimensions to CSS pixels.
    //
    // We deliberately use a fixed CSS page height.
    // This avoids the previous problem where Chrome was
    // capturing arbitrary portions of the document.
    // --------------------------------------------------------

    const pageHeightPx =
        Math.floor(
            A4_HEIGHT_PX
        );


    const pageWidthPx =
        Math.floor(
            A4_WIDTH_PX
        );


    // The page content area in PDF.
    const contentWidthMm =
        210 - PDF_MARGIN * 2;

    const contentHeightMm =
        297 - PDF_MARGIN * 2;


    // --------------------------------------------------------
    // The notebook is rendered at one stable width.
    // --------------------------------------------------------

    documentElement.style.width =
        `${pageWidthPx}px`;


    documentElement.style.maxWidth =
        "none";


    // --------------------------------------------------------
    // Render pages one at a time.
    //
    // IMPORTANT:
    // We do NOT clone the whole notebook.
    // We do NOT move the notebook itself.
    //
    // html2canvas receives a dedicated page viewport
    // containing a clone that is translated internally.
    // The original notebook never moves.
    // --------------------------------------------------------

    const pageCount =
        Math.ceil(
            totalHeight /
            pageHeightPx
        );


    for (
        let page = 0;
        page < pageCount;
        page++
    ) {
        showStatus(
            "Creating PDF...",
            `Page ${page + 1} of ${pageCount}`
        );


        const startY =
            page *
            pageHeightPx;


        const remaining =
            totalHeight -
            startY;


        const visibleHeight =
            Math.min(
                pageHeightPx,
                remaining
            );


        // --------------------------------------------
        // Dedicated capture viewport.
        // It is far outside the visible screen.
        // --------------------------------------------

        const viewport =
            document.createElement("div");

        viewport.style.position =
            "fixed";

        viewport.style.left =
            "-200000px";

        viewport.style.top =
            "0";

        viewport.style.width =
            `${pageWidthPx}px`;

        viewport.style.height =
            `${visibleHeight}px`;

        viewport.style.overflow =
            "hidden";

        viewport.style.background =
            "#ffffff";

        viewport.style.pointerEvents =
            "none";

        viewport.style.zIndex =
            "-999999";


        // --------------------------------------------
        // Clone only for the capture operation.
        // The clone is never shown to the user.
        // --------------------------------------------

        const clone =
            documentElement.cloneNode(
                true
            );


        clone.style.position =
            "absolute";

        clone.style.left =
            "0";

        clone.style.top =
            `${-startY}px`;

        clone.style.width =
            `${pageWidthPx}px`;

        clone.style.margin =
            "0";

        clone.style.padding =
            getComputedStyle(
                documentElement
            ).padding;


        viewport.appendChild(
            clone
        );

        document.body.appendChild(
            viewport
        );


        // Give Chrome/Brave/Firefox one paint cycle.
        await waitForPaint();


        let canvas = null;


        try {
            canvas =
                await html2canvas(
                    viewport,
                    {
                        backgroundColor:
                            "#ffffff",

                        scale:
                            RENDER_SCALE,

                        width:
                            pageWidthPx,

                        height:
                            visibleHeight,

                        windowWidth:
                            pageWidthPx,

                        windowHeight:
                            visibleHeight,

                        scrollX: 0,

                        scrollY: 0,

                        useCORS:
                            true,

                        allowTaint:
                            false,

                        imageTimeout:
                            15000,

                        logging:
                            false,

                        foreignObjectRendering:
                            false,

                        removeContainer:
                            true
                    }
                );

        } finally {
            viewport.remove();
        }


        if (
            !canvas ||
            canvas.width <= 0 ||
            canvas.height <= 0
        ) {
            throw new Error(
                `Failed to render PDF page ${page + 1}.`
            );
        }


        // --------------------------------------------
        // Calculate exact PDF image size.
        // --------------------------------------------

        const imageWidth =
            contentWidthMm;


        const imageHeight =
            Math.min(
                contentHeightMm,
                (
                    canvas.height /
                    canvas.width
                ) *
                imageWidth
            );


        // --------------------------------------------
        // PNG is used for notebook pages.
        //
        // This keeps the text much cleaner than the
        // previous JPEG-heavy approach.
        // --------------------------------------------

        const imageData =
            canvas.toDataURL(
                "image/png"
            );


        if (page > 0) {
            pdf.addPage();
        }


        pdf.addImage(
            imageData,
            "PNG",
            PDF_MARGIN,
            PDF_MARGIN,
            imageWidth,
            imageHeight,
            undefined,
            "FAST"
        );


        // --------------------------------------------
        // Destroy canvas immediately.
        // This is important in Chrome.
        // --------------------------------------------

        canvas.width = 1;
        canvas.height = 1;
        canvas = null;


        // Let the browser release memory before
        // starting the next page.
        await waitForPaint();


        if (
            page % 2 === 1
        ) {
            await sleep(20);
        }
    }


    return pdf;
}


// ============================================================
// MATHJAX
// ============================================================

async function typesetMath() {
    if (
        !window.MathJax ||
        typeof window.MathJax.typesetPromise !==
            "function"
    ) {
        return;
    }

    try {
        await window.MathJax.typesetPromise([
            pdfRenderContainer
        ]);
    } catch (error) {
        console.warn(
            "MathJax rendering warning:",
            error
        );
    }

    await waitForPaint();
}


// ============================================================
// IMAGE WAIT
// ============================================================

async function waitForImages(
    root
) {
    const images =
        Array.from(
            root.querySelectorAll(
                "img"
            )
        );


    if (!images.length) {
        return;
    }


    await Promise.all(
        images.map(
            image =>
                new Promise(resolve => {

                    if (
                        image.complete
                    ) {
                        resolve();
                        return;
                    }

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
                })
        )
    );
}


// ============================================================
// PAINT HELPERS
// ============================================================

function waitForPaint() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
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
// ERROR
// ============================================================

function showError(
    message
) {
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
// CLEANUP
// ============================================================

function clearRenderContainer() {
    if (
        pdfRenderContainer
    ) {
        pdfRenderContainer.innerHTML =
            "";
    }
}


// ============================================================
// UTILITIES
// ============================================================

function sourceToString(
    source
) {
    if (
        Array.isArray(source)
    ) {
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


function formatFileSize(
    bytes
) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (
        bytes <
        1024 * 1024
    ) {
        return `${(
            bytes / 1024
        ).toFixed(1)} KB`;
    }

    return `${(
        bytes /
        (1024 * 1024)
    ).toFixed(1)} MB`;
}
