"use strict";


/* =========================================================
   ELEMENTS
   ========================================================= */

const fileInput =
    document.getElementById("fileInput");

const dropZone =
    document.getElementById("dropZone");

const fileInfo =
    document.getElementById("fileInfo");

const fileName =
    document.getElementById("fileName");

const fileSize =
    document.getElementById("fileSize");

const removeFile =
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
    document.getElementById(
        "pdfRenderContainer"
    );


/* =========================================================
   STATE
   ========================================================= */

let selectedFile = null;


/* =========================================================
   INIT
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setupFileInput();

        setupDragAndDrop();

        removeFile.addEventListener(
            "click",
            clearSelectedFile
        );

        convertButton.addEventListener(
            "click",
            convertNotebook
        );

    }
);


/* =========================================================
   FILE PICKER
   ========================================================= */

function setupFileInput() {

    /*
        IMPORTANT:

        Do NOT use fileInput.click() here.

        The native <label for="fileInput">
        opens the Chrome file picker.
    */

    fileInput.addEventListener(
        "change",
        (event) => {

            const file =
                event.target.files &&
                event.target.files[0];

            if (!file) {
                return;
            }

            selectFile(file);

        }
    );

}


/* =========================================================
   DRAG AND DROP
   ========================================================= */

function setupDragAndDrop() {

    dropZone.addEventListener(
        "dragenter",
        preventDrag
    );

    dropZone.addEventListener(
        "dragover",
        preventDrag
    );

    dropZone.addEventListener(
        "dragleave",
        (event) => {

            event.preventDefault();

            dropZone.classList.remove(
                "dragover"
            );

        }
    );

    dropZone.addEventListener(
        "drop",
        (event) => {

            event.preventDefault();
            event.stopPropagation();

            dropZone.classList.remove(
                "dragover"
            );

            const files =
                event.dataTransfer.files;

            if (
                files &&
                files.length > 0
            ) {

                selectFile(
                    files[0]
                );

            }

        }
    );

}


function preventDrag(event) {

    event.preventDefault();

    event.stopPropagation();

    dropZone.classList.add(
        "dragover"
    );

}


/* =========================================================
   SELECT FILE
   ========================================================= */

function selectFile(file) {

    clearError();


    if (!file.name
        .toLowerCase()
        .endsWith(".ipynb")) {

        showError(
            "Please select a Jupyter Notebook (.ipynb) file."
        );

        fileInput.value = "";

        return;
    }


    if (
        file.size >
        50 * 1024 * 1024
    ) {

        showError(
            "This notebook is larger than 50 MB. " +
            "Large notebooks may require too much browser memory."
        );

        fileInput.value = "";

        return;
    }


    selectedFile = file;


    fileName.textContent =
        file.name;

    fileSize.textContent =
        formatFileSize(
            file.size
        );


    fileInfo.classList.remove(
        "hidden"
    );

    convertButton.disabled =
        false;

}


/* =========================================================
   CLEAR FILE
   ========================================================= */

function clearSelectedFile() {

    selectedFile = null;

    fileInput.value = "";

    fileInfo.classList.add(
        "hidden"
    );

    convertButton.disabled =
        true;

    clearError();

}


/* =========================================================
   CONVERT
   ========================================================= */

async function convertNotebook() {

    if (!selectedFile) {

        showError(
            "Please select an .ipynb file first."
        );

        return;
    }


    convertButton.disabled = true;

    clearError();

    showStatus(
        "Preparing...",
        "Reading your notebook"
    );


    try {

        verifyLibraries();


        /*
            Read JSON.
        */

        const notebook =
            await readNotebook(
                selectedFile
            );


        showStatus(
            "Preparing...",
            "Building notebook"
        );


        /*
            Build the notebook DOM.
        */

        const html =
            notebookToHTML(
                notebook
            );


        pdfRenderContainer.innerHTML =
            html;


        /*
            Wait for browser layout.
        */

        await waitForPaint();


        showStatus(
            "Preparing...",
            "Loading images and formulas"
        );


        await waitForImages(
            pdfRenderContainer
        );


        await renderMath();


        await waitForPaint();


        /*
            Give Chrome a short moment to finish
            painting the final DOM.
        */

        await sleep(200);


        /*
            Create PDF.
        */

        const pdf =
            await buildPDF();


        /*
            Download only AFTER PDF creation is
            completely finished.
        */

        showStatus(
            "Downloading...",
            "Preparing your PDF"
        );


        const outputName =
            selectedFile.name.replace(
                /\.ipynb$/i,
                ""
            ) + ".pdf";


        pdf.save(
            outputName
        );


        showStatus(
            "Done!",
            "Your PDF has been downloaded"
        );


        await sleep(1200);

        hideStatus();


    } catch (error) {

        console.error(
            "IPYNB → PDF error:",
            error
        );

        hideStatus();

        showError(
            error &&
            error.message
                ? error.message
                : "Could not create the PDF."
        );

    } finally {

        convertButton.disabled =
            !selectedFile;


        /*
            VERY IMPORTANT:

            Destroy the temporary notebook DOM
            after conversion.
        */

        pdfRenderContainer.innerHTML =
            "";

    }

}


/* =========================================================
   VERIFY LIBRARIES
   ========================================================= */

function verifyLibraries() {

    if (
        !window.marked ||
        typeof window.marked.parse !==
            "function"
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


            reader.onload =
                () => {

                    try {

                        const notebook =
                            JSON.parse(
                                reader.result
                            );


                        if (
                            !notebook ||
                            !Array.isArray(
                                notebook.cells
                            )
                        ) {

                            throw new Error(
                                "Invalid notebook"
                            );

                        }


                        resolve(
                            notebook
                        );

                    } catch {

                        reject(
                            new Error(
                                "Could not read the notebook. " +
                                "The .ipynb file may be invalid."
                            )
                        );

                    }

                };


            reader.onerror =
                () => {

                    reject(
                        new Error(
                            "The browser could not read the selected file."
                        )
                    );

                };


            reader.readAsText(
                file
            );

        }
    );

}


/* =========================================================
   NOTEBOOK → HTML
   ========================================================= */

function notebookToHTML(
    notebook
) {

    let html = `
        <article class="notebook-document">
    `;


    /*
        Title
    */

    html += `
        <h1 class="notebook-title">
            ${escapeHTML(
                selectedFile
                    ? selectedFile.name
                        .replace(
                            /\.ipynb$/i,
                            ""
                        )
                    : "Jupyter Notebook"
            )}
        </h1>
    `;


    /*
        Cells
    */

    notebook.cells.forEach(
        (cell, index) => {

            const type =
                cell.cell_type || "";


            const source =
                Array.isArray(
                    cell.source
                )
                    ? cell.source.join("")
                    : String(
                        cell.source || ""
                    );


            if (
                type === "markdown"
            ) {

                html += `
                    <section class="notebook-cell markdown-cell">
                        ${renderMarkdown(source)}
                    </section>
                `;

                return;
            }


            if (
                type === "code"
            ) {

                const execution =
                    cell.execution_count ??
                    index + 1;


                html += `
                    <section class="notebook-cell code-cell">

                        <div class="code-label">
                            In [${escapeHTML(
                                execution
                            )}]
                        </div>

                        <pre class="code-block">${escapeHTML(
                            source
                        )}</pre>

                        ${renderOutputs(
                            cell.outputs || []
                        )}

                    </section>
                `;

                return;
            }


            if (
                type === "raw"
            ) {

                html += `
                    <section class="notebook-cell markdown-cell">

                        <pre class="code-block">${escapeHTML(
                            source
                        )}</pre>

                    </section>
                `;

            }

        }
    );


    html += `
        </article>
    `;


    return html;

}


/* =========================================================
   MARKDOWN
   ========================================================= */

function renderMarkdown(
    markdown
) {

    const parsed =
        window.marked.parse(
            markdown || ""
        );


    return window.DOMPurify.sanitize(
        parsed
    );

}


/* =========================================================
   OUTPUTS
   ========================================================= */

function renderOutputs(
    outputs
) {

    if (
        !Array.isArray(outputs)
    ) {

        return "";

    }


    return outputs
        .map(
            renderOutput
        )
        .join("");

}


/* =========================================================
   OUTPUT
   ========================================================= */

function renderOutput(
    output
) {

    if (!output) {
        return "";
    }


    const type =
        output.output_type || "";


    /*
        Stream
    */

    if (
        type === "stream"
    ) {

        const text =
            Array.isArray(
                output.text
            )
                ? output.text.join("")
                : String(
                    output.text || ""
                );


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
        Error
    */

    if (
        type === "error"
    ) {

        const traceback =
            Array.isArray(
                output.traceback
            )
                ? output.traceback.join("\n")
                : "";


        const message =
            traceback ||
            (
                String(
                    output.ename || ""
                )
                +
                "\n" +
                String(
                    output.evalue || ""
                )
            );


        return `
            <div class="output-cell">

                <div class="output-label">
                    Error
                </div>

                <div class="output-error">${escapeHTML(
                    message
                )}</div>

            </div>
        `;

    }


    /*
        Display / execute result
    */

    if (
        type === "display_data" ||
        type === "execute_result"
    ) {

        return renderMimeData(
            output.data || {}
        );

    }


    return "";

}


/* =========================================================
   MIME DATA
   ========================================================= */

function renderMimeData(
    data
) {

    /*
        PNG
    */

    if (
        data["image/png"]
    ) {

        const image =
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
                    src="data:image/png;base64,${image}"
                    alt="Notebook output"
                >

            </div>
        `;

    }


    /*
        JPEG
    */

    if (
        data["image/jpeg"]
    ) {

        const image =
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
                    src="data:image/jpeg;base64,${image}"
                    alt="Notebook output"
                >

            </div>
        `;

    }


    /*
        SVG
    */

    if (
        data["image/svg+xml"]
    ) {

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

    if (
        data["text/html"]
    ) {

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

    if (
        data["text/plain"]
    ) {

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
   BUILD PDF
   ========================================================= */

async function buildPDF() {

    const {
        jsPDF
    } = window.jspdf;


    /*
        A4
    */

    const PAGE_WIDTH =
        210;

    const PAGE_HEIGHT =
        297;

    const MARGIN =
        10;

    const CONTENT_WIDTH =
        PAGE_WIDTH -
        MARGIN * 2;

    const CONTENT_HEIGHT =
        PAGE_HEIGHT -
        MARGIN * 2;


    /*
        We deliberately use a modest scale.

        This reduces Chrome memory consumption.
    */

    const SCALE =
        1.25;


    const RENDER_WIDTH =
        794;


    const documentElement =
        pdfRenderContainer.querySelector(
            ".notebook-document"
        );


    if (!documentElement) {

        throw new Error(
            "Notebook rendering failed."
        );

    }


    /*
        Force fixed rendering width.
    */

    documentElement.style.width =
        `${RENDER_WIDTH}px`;


    /*
        Get total document height.
    */

    const totalHeight =
        Math.ceil(
            documentElement.getBoundingClientRect()
                .height
        );


    if (
        totalHeight <= 0
    ) {

        throw new Error(
            "The notebook appears to be empty."
        );

    }


    /*
        Create PDF.
    */

    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    /*
        Convert PDF dimensions into pixels.

        We capture approximately one PDF page
        at a time rather than a huge notebook canvas.
    */

    const pixelsPerMm =
        (
            RENDER_WIDTH * SCALE
        ) /
        CONTENT_WIDTH;


    const PAGE_PIXEL_HEIGHT =
        Math.floor(
            CONTENT_HEIGHT *
            pixelsPerMm
        );


    /*
        Capture a little less than the entire page.

        This gives Chrome some safety around rounding.
    */

    const CAPTURE_HEIGHT =
        Math.min(
            1050,
            PAGE_PIXEL_HEIGHT
        );


    /*
        Current position in the notebook.
    */

    let currentY = 0;

    let pageNumber = 0;


    /*
        Page-by-page rendering.
    */

    while (
        currentY < totalHeight
    ) {

        const remaining =
            totalHeight -
            currentY;


        const chunkHeight =
            Math.min(
                CAPTURE_HEIGHT,
                remaining
            );


        showStatus(
            "Creating PDF...",
            `Rendering page ${pageNumber + 1}`
        );


        /*
            Create a small temporary page.
        */

        const pageWrapper =
            document.createElement(
                "div"
            );


        pageWrapper.style.position =
            "fixed";

        pageWrapper.style.left =
            "-100000px";

        pageWrapper.style.top =
            "0";

        pageWrapper.style.width =
            `${RENDER_WIDTH}px`;

        pageWrapper.style.height =
            `${chunkHeight}px`;

        pageWrapper.style.overflow =
            "hidden";

        pageWrapper.style.background =
            "#ffffff";

        pageWrapper.style.zIndex =
            "-1";


        /*
            Clone only the notebook for this
            individual capture.
        */

        const clone =
            documentElement.cloneNode(
                true
            );


        clone.style.position =
            "absolute";

        clone.style.left =
            "0";

        clone.style.top =
            `${-currentY}px`;

        clone.style.width =
            `${RENDER_WIDTH}px`;

        clone.style.margin =
            "0";


        pageWrapper.appendChild(
            clone
        );


        document.body.appendChild(
            pageWrapper
        );


        /*
            Let Chrome paint the small page.
        */

        await nextFrame();


        /*
            Capture.
        */

        let canvas;


        try {

            canvas =
                await window.html2canvas(
                    pageWrapper,
                    {
                        backgroundColor:
                            "#ffffff",

                        scale:
                            SCALE,

                        width:
                            RENDER_WIDTH,

                        height:
                            chunkHeight,

                        windowWidth:
                            RENDER_WIDTH,

                        windowHeight:
                            chunkHeight,

                        scrollX:
                            0,

                        scrollY:
                            0,

                        useCORS:
                            true,

                        allowTaint:
                            false,

                        logging:
                            false,

                        imageTimeout:
                            10000
                    }
                );

        } finally {

            /*
                Remove the page immediately.
            */

            pageWrapper.remove();

        }


        /*
            Determine actual PDF image height.
        */

        const imageHeight =
            canvas.height /
            pixelsPerMm;


        /*
            New PDF page except first.
        */

        if (
            pageNumber > 0
        ) {

            pdf.addPage();

        }


        /*
            Convert directly to JPEG.

            JPEG uses substantially less memory
            than PNG for large notebook pages.
        */

        const imageData =
            canvas.toDataURL(
                "image/jpeg",
                0.88
            );


        pdf.addImage(
            imageData,
            "JPEG",
            MARGIN,
            MARGIN,
            CONTENT_WIDTH,
            Math.min(
                imageHeight,
                CONTENT_HEIGHT
            ),
            undefined,
            "FAST"
        );


        pageNumber++;


        /*
            Free canvas memory.
        */

        canvas.width = 1;
        canvas.height = 1;

        canvas = null;


        /*
            Move forward.

            Use the exact captured CSS height.
        */

        currentY +=
            chunkHeight;


        /*
            Let Chrome clean up memory.
        */

        await nextFrame();

        await sleep(20);

    }


    /*
        Return finished PDF.
    */

    return pdf;

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


    if (
        images.length === 0
    ) {

        return;

    }


    await Promise.all(
        images.map(
            image => {

                if (
                    image.complete
                ) {

                    return Promise.resolve();

                }


                return new Promise(
                    resolve => {

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
   MATHJAX
   ========================================================= */

async function renderMath() {

    if (
        window.MathJax &&
        typeof window.MathJax.typesetPromise ===
            "function"
    ) {

        try {

            await window.MathJax.typesetPromise(
                [pdfRenderContainer]
            );

        } catch (error) {

            console.warn(
                "MathJax warning:",
                error
            );

        }

    }

}


/* =========================================================
   PAINT
   ========================================================= */

function waitForPaint() {

    return new Promise(
        resolve => {

            requestAnimationFrame(
                () => {

                    requestAnimationFrame(
                        () => {

                            resolve();

                        }
                    );

                }
            );

        }
    );

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


function hideStatus() {

    status.classList.add(
        "hidden"
    );

}


/* =========================================================
   ERRORS
   ========================================================= */

function showError(
    message
) {

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

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
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


function formatFileSize(
    bytes
) {

    if (
        bytes <= 0
    ) {

        return "0 KB";

    }


    const units = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];


    const index =
        Math.min(
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            ),
            units.length - 1
        );


    const value =
        bytes /
        Math.pow(
            1024,
            index
        );


    return (
        Math.round(
            value * 100
        ) / 100
    )
    + " "
    + units[index];

}


function sleep(
    milliseconds
) {

    return new Promise(
        resolve => {

            setTimeout(
                resolve,
                milliseconds
            );

        }
    );

}
