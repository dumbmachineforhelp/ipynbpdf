const dropZone =
    document.getElementById("dropZone");

const fileInput =
    document.getElementById("notebook");

const fileInfo =
    document.getElementById("fileInfo");

const fileName =
    document.getElementById("fileName");

const removeFile =
    document.getElementById("removeFile");

const convertButton =
    document.getElementById("convertButton");

const status =
    document.getElementById("status");

const statusText =
    document.getElementById("statusText");

const errorBox =
    document.getElementById("error");


let selectedFile = null;


// Open file selector
dropZone.addEventListener("click", () => {
    fileInput.click();
});


// File selected
fileInput.addEventListener("change", () => {

    if (fileInput.files.length > 0) {
        selectFile(fileInput.files[0]);
    }

});


// Drag over
dropZone.addEventListener("dragover", (event) => {

    event.preventDefault();

    dropZone.classList.add("dragover");

});


// Drag leave
dropZone.addEventListener("dragleave", () => {

    dropZone.classList.remove("dragover");

});


// Drop file
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

        showError(
            "Please select a .ipynb file."
        );

        return;
    }

    selectedFile = file;

    fileName.textContent = file.name;

    fileInfo.classList.remove("hidden");

    dropZone.classList.add("hidden");

    convertButton.disabled = false;
}


// Remove file
removeFile.addEventListener("click", () => {

    selectedFile = null;

    fileInput.value = "";

    fileInfo.classList.add("hidden");

    dropZone.classList.remove("hidden");

    convertButton.disabled = true;

});


// Convert
convertButton.addEventListener("click", async () => {

    if (!selectedFile) {
        return;
    }

    hideError();

    convertButton.disabled = true;

    status.classList.remove("hidden");

    statusText.textContent =
        "Reading your notebook...";

    try {

        const text =
            await selectedFile.text();

        const notebook =
            JSON.parse(text);


        statusText.textContent =
            "Creating PDF...";


        const pdfBlob =
            await notebookToPDF(notebook);


        const url =
            URL.createObjectURL(pdfBlob);

        const link =
            document.createElement("a");

        link.href = url;

        link.download =
            selectedFile.name.replace(
                /\.ipynb$/i,
                ".pdf"
            );

        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(url);


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


// Convert notebook
async function notebookToPDF(notebook) {

    // Create printable HTML
    let html = `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<style>

body {
    font-family: Arial, sans-serif;
    color: #111;
    padding: 30px;
    line-height: 1.5;
}

h1, h2, h3 {
    margin-top: 25px;
}

.cell {
    margin-bottom: 25px;
}

.code {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 12px;
    white-space: pre-wrap;
    font-family: monospace;
}

.output {
    background: #fafafa;
    border-left: 4px solid #6366f1;
    padding: 10px;
    margin-top: 10px;
    white-space: pre-wrap;
}

img {
    max-width: 100%;
}

</style>

</head>

<body>
`;


    for (const cell of notebook.cells || []) {

        html += `<div class="cell">`;


        // Markdown
        if (cell.cell_type === "markdown") {

            html +=
                markdownToHTML(
                    cell.source || ""
                );

        }


        // Code
        else if (cell.cell_type === "code") {

            html += `
<div class="code">${escapeHTML(
                cell.source || ""
            )}</div>
`;


            // Outputs
            for (
                const output of
                cell.outputs || []
            ) {

                html += outputToHTML(output);

            }

        }


        html += `</div>`;

    }


    html += `
</body>
</html>
`;


    return await createPDF(html);
}


// Basic Markdown rendering
function markdownToHTML(text) {

    let result =
        escapeHTML(text);


    result =
        result.replace(
            /^### (.*)$/gm,
            "<h3>$1</h3>"
        );

    result =
        result.replace(
            /^## (.*)$/gm,
            "<h2>$1</h2>"
        );

    result =
        result.replace(
            /^# (.*)$/gm,
            "<h1>$1</h1>"
        );

    result =
        result.replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        );

    result =
        result.replace(
            /\*(.*?)\*/g,
            "<em>$1</em>"
        );

    result =
        result.replace(
            /\n/g,
            "<br>"
        );

    return result;
}


// Convert outputs to HTML
function outputToHTML(output) {

    if (
        output.output_type ===
        "stream"
    ) {

        return `
<div class="output">
${escapeHTML(output.text || "")}
</div>
`;

    }


    if (
        output.output_type ===
        "error"
    ) {

        return `
<div class="output">
<strong>${escapeHTML(
            output.ename || "Error"
        )}</strong>

<br>

${escapeHTML(
            (output.traceback || []).join("\n")
        )}

</div>
`;

    }


    if (
        output.data
    ) {

        // PNG
        if (
            output.data["image/png"]
        ) {

            return `
<div class="output">
<img src="data:image/png;base64,${
                output.data["image/png"]
            }">
</div>
`;

        }


        // JPEG
        if (
            output.data["image/jpeg"]
        ) {

            return `
<div class="output">
<img src="data:image/jpeg;base64,${
                output.data["image/jpeg"]
            }">
</div>
`;

        }


        // HTML
        if (
            output.data["text/html"]
        ) {

            return `
<div class="output">
${output.data["text/html"]}
</div>
`;

        }


        // Plain text
        if (
            output.data["text/plain"]
        ) {

            return `
<div class="output">
${escapeHTML(
                output.data["text/plain"]
            )}
</div>
`;

        }

    }


    return "";
}


// Browser PDF generation
async function createPDF(html) {

    /*
       Uses the browser print dialog.

       A real PDF engine cannot be executed
       directly by GitHub Pages.

       We create a printable document in a
       new browser window.
    */

    const printWindow =
        window.open(
            "",
            "_blank"
        );


    if (!printWindow) {

        throw new Error(
            "Please allow popups for this website."
        );

    }


    printWindow.document.open();

    printWindow.document.write(html);

    printWindow.document.close();


    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                500
            )
    );


    printWindow.focus();

    printWindow.print();


    return new Blob(
        [],
        {
            type:
                "application/pdf"
        }
    );
}


// Escape HTML
function escapeHTML(text) {

    return String(text)
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


function showError(message) {

    errorBox.textContent = message;

    errorBox.classList.remove(
        "hidden"
    );

}


function hideError() {

    errorBox.classList.add(
        "hidden"
    );

}
