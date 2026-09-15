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


// --------------------------------------------------
// File selection
// --------------------------------------------------

dropZone.addEventListener("click", () => {
    fileInput.click();
});


fileInput.addEventListener("change", () => {

    if (fileInput.files.length > 0) {
        selectFile(fileInput.files[0]);
    }

});


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


// --------------------------------------------------
// Remove file
// --------------------------------------------------

removeFile.addEventListener("click", () => {

    selectedFile = null;

    fileInput.value = "";

    fileInfo.classList.add("hidden");

    dropZone.classList.remove("hidden");

    convertButton.disabled = true;

});


// --------------------------------------------------
// Convert
// --------------------------------------------------

convertButton.addEventListener("click", async () => {

    if (!selectedFile) {
        return;
    }

    hideError();

    convertButton.disabled = true;

    status.classList.remove("hidden");

    try {

        statusText.textContent =
            "Reading notebook...";

        const text =
            await selectedFile.text();

        const notebook =
            JSON.parse(text);


        validateNotebook(notebook);


        statusText.textContent =
            "Rendering notebook...";


        const element =
            await notebookToHTML(notebook);


        statusText.textContent =
            "Preparing PDF...";


        await waitForImages(element);

        await waitForMath();


        statusText.textContent =
            "Generating PDF...";


        const pdf =
            await createPDF(element);


        const filename =
            selectedFile.name.replace(
                /\.ipynb$/i,
                ".pdf"
            );


        pdf.save(filename);


        statusText.textContent =
            "PDF downloaded successfully!";


    } catch (error) {

        console.error(error);

        showError(
            "Conversion failed: " +
            error.message
        );

        status.classList.add("hidden");

    } finally {

        convertButton.disabled = false;

    }

});


// --------------------------------------------------
// Validate notebook
// --------------------------------------------------

function validateNotebook(notebook) {

    if (!notebook ||
        typeof notebook !== "object") {

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


// --------------------------------------------------
// Render notebook
// --------------------------------------------------

async function notebookToHTML(notebook) {

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "notebook-document";


    // Notebook title

    if (notebook.metadata?.title) {

        const title =
            document.createElement("h1");

        title.className =
            "notebook-title";

        title.textContent =
            notebook.metadata.title;

        wrapper.appendChild(title);

    }


    for (const cell of notebook.cells) {

        const cellElement =
            document.createElement("section");

        cellElement.className =
            "notebook-cell";


        // ------------------------------------------
        // Markdown
        // ------------------------------------------

        if (cell.cell_type === "markdown") {

            const markdown =
                Array.isArray(cell.source)
                    ? cell.source.join("")
                    : (cell.source || "");


            const html =
                marked.parse(markdown);


            cellElement.innerHTML =
                DOMPurify.sanitize(html);

            wrapper.appendChild(cellElement);

            continue;
        }


        // ------------------------------------------
        // Code
        // ------------------------------------------

        if (cell.cell_type === "code") {

            const source =
                Array.isArray(cell.source)
                    ? cell.source.join("")
                    : (cell.source || "");


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


            // --------------------------------------
            // Outputs
            // --------------------------------------

            for (const output of cell.outputs || []) {

                const outputElement =
                    renderOutput(output);


                if (outputElement) {

                    cellElement.appendChild(
                        outputElement
                    );

                }

            }


            wrapper.appendChild(cellElement);
        }

    }


    // Put into temporary container so MathJax
    // and image loading can operate on it.

    const container =
        document.createElement("div");

    container.className =
        "pdf-render-container";


    container.appendChild(wrapper);


    document.body.appendChild(container);


    // MathJax

    if (window.MathJax) {

        await MathJax.typesetPromise([
            container
        ]);

    }


    return container;
}


// --------------------------------------------------
// Render outputs
// --------------------------------------------------

function renderOutput(output) {

    const container =
        document.createElement("div");

    container.className =
        "output";


    // ----------------------------------------------
    // Stream
    // ----------------------------------------------

    if (output.output_type === "stream") {

        const text =
            Array.isArray(output.text)
                ? output.text.join("")
                : (output.text || "");


        const pre =
            document.createElement("pre");

        pre.textContent =
            text;


        container.appendChild(pre);

        return container;
    }


    // ----------------------------------------------
    // Error
    // ----------------------------------------------

    if (output.output_type === "error") {

        const title =
            document.createElement("strong");

        title.textContent =
            `${output.ename || "Error"}: ${
                output.evalue || ""
            }`;


        const traceback =
            document.createElement("pre");


        traceback.textContent =
            Array.isArray(output.traceback)
                ? output.traceback.join("\n")
                : "";


        container.appendChild(title);

        container.appendChild(traceback);

        return container;
    }


    // ----------------------------------------------
    // Rich MIME output
    // ----------------------------------------------

    if (output.data) {

        // PNG

        if (output.data["image/png"]) {

            const img =
                document.createElement("img");

            img.src =
                `data:image/png;base64,${cleanBase64(
                    output.data["image/png"]
                )}`;

            img.className =
                "output-image";

            container.appendChild(img);

            return container;
        }


        // JPEG

        if (output.data["image/jpeg"]) {

            const img =
                document.createElement("img");

            img.src =
                `data:image/jpeg;base64,${cleanBase64(
                    output.data["image/jpeg"]
                )}`;

            img.className =
                "output-image";

            container.appendChild(img);

            return container;
        }


        // SVG

        if (output.data["image/svg+xml"]) {

            const svg =
                output.data["image/svg+xml"];


            container.innerHTML =
                DOMPurify.sanitize(
                    Array.isArray(svg)
                        ? svg.join("")
                        : svg
                );


            return container;
        }


        // HTML

        if (output.data["text/html"]) {

            const html =
                Array.isArray(
                    output.data["text/html"]
                )
                    ? output.data["text/html"].join("")
                    : output.data["text/html"];


            container.innerHTML =
                DOMPurify.sanitize(html, {
                    ADD_TAGS: [
                        "iframe"
                    ]
                });


            return container;
        }


        // Plain text

        if (output.data["text/plain"]) {

            const text =
                Array.isArray(
                    output.data["text/plain"]
                )
                    ? output.data["text/plain"].join("")
                    : output.data["text/plain"];


            const pre =
                document.createElement("pre");

            pre.textContent =
                text;


            container.appendChild(pre);

            return container;
        }

    }


    return null;
}


// --------------------------------------------------
// Base64 cleanup
// --------------------------------------------------

function cleanBase64(data) {

    if (Array.isArray(data)) {
        data = data.join("");
    }

    return String(data)
        .replace(/\s/g, "");
}


// --------------------------------------------------
// Wait for images
// --------------------------------------------------

async function waitForImages(container) {

    const images =
        [...container.querySelectorAll("img")];

    await Promise.all(
        images.map(img => {

            if (img.complete) {
                return Promise.resolve();
            }

            return new Promise(resolve => {

                img.onload = resolve;

                img.onerror = resolve;

            });

        })
    );

}


// --------------------------------------------------
// Wait for MathJax
// --------------------------------------------------

async function waitForMath() {

    if (
        window.MathJax &&
        MathJax.startup &&
        MathJax.startup.promise
    ) {

        await MathJax.startup.promise;

    }

}


// --------------------------------------------------
// Create actual PDF
// --------------------------------------------------

async function createPDF(element) {

    const {
        jsPDF
    } = window.jspdf;


    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    const canvas =
        await html2canvas(element, {

            scale:
                Math.min(
                    2,
                    window.devicePixelRatio || 1
                ),

            useCORS: true,

            backgroundColor:
                "#ffffff",

            logging: false

        });


    const imgData =
        canvas.toDataURL(
            "image/jpeg",
            0.95
        );


    const pageWidth =
        210;

    const pageHeight =
        297;


    const margin =
        10;


    const usableWidth =
        pageWidth - margin * 2;


    const imageWidth =
        usableWidth;


    const imageHeight =
        canvas.height *
        imageWidth /
        canvas.width;


    let heightLeft =
        imageHeight;


    let position =
        margin;


    pdf.addImage(
        imgData,
        "JPEG",
        margin,
        position,
        imageWidth,
        imageHeight
    );


    heightLeft -=
        pageHeight -
        margin * 2;


    while (heightLeft > 0) {

        position =
            margin -
            (imageHeight - heightLeft);


        pdf.addPage();


        pdf.addImage(
            imgData,
            "JPEG",
            margin,
            position,
            imageWidth,
            imageHeight
        );


        heightLeft -=
            pageHeight -
            margin * 2;
    }


    // Remove temporary DOM

    element.remove();


    return pdf;
}


// --------------------------------------------------
// Error handling
// --------------------------------------------------

function showError(message) {

    errorBox.textContent =
        message;

    errorBox.classList.remove(
        "hidden"
    );

}


function hideError() {

    errorBox.classList.add(
        "hidden"
    );

}
