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
       Stable A4 rendering width
       --------------------------------------------- */

    const RENDER_WIDTH = 794;

    element.style.width =
        `${RENDER_WIDTH}px`;

    element.style.maxWidth =
        "none";

    element.style.display =
        "block";

    element.style.background =
        "#ffffff";


    /*
       Force the browser to finish layout before
       html2canvas starts.
    */

    void element.offsetHeight;


    await new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        });
    });


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
       PDF dimensions
       --------------------------------------------- */

    const pdf =
        new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });


    const PAGE_WIDTH = 210;
    const PAGE_HEIGHT = 297;
    const MARGIN = 10;

    const CONTENT_WIDTH =
        PAGE_WIDTH - MARGIN * 2;

    const CONTENT_HEIGHT =
        PAGE_HEIGHT - MARGIN * 2;


    /* ---------------------------------------------
       IMPORTANT

       1.5 instead of 2.

       2x creates extremely large canvases on
       long notebooks and is the main reason Chrome
       becomes extremely slow.

       1.5 still gives very good text quality.
       --------------------------------------------- */

    const SCALE = 1.5;


    /* ---------------------------------------------
       Calculate source pixels corresponding to
       one complete PDF content area.
       --------------------------------------------- */

    const sourcePageHeight =
        Math.floor(
            width *
            CONTENT_HEIGHT /
            CONTENT_WIDTH
        );


    let sourceY = 0;

    let pageNumber = 0;


    /* ---------------------------------------------
       Render notebook in page-sized pieces.

       The IMPORTANT difference from the previous
       broken versions is:

       - we do NOT move the original element
       - we do NOT modify its position
       - we do NOT clone the notebook
       - the visible notebook remains untouched

       html2canvas simply captures the requested
       vertical region.
       --------------------------------------------- */

    while (sourceY < height) {

        const remaining =
            height - sourceY;

        const currentHeight =
            Math.min(
                sourcePageHeight,
                remaining
            );


        /* -----------------------------------------
           Status
           ----------------------------------------- */

        if (typeof statusText !== "undefined") {

            const totalPages =
                Math.ceil(
                    height /
                    sourcePageHeight
                );

            statusText.textContent =
                `Rendering page ${
                    pageNumber + 1
                } of ${totalPages}...`;

        }


        /* -----------------------------------------
           Capture only this region.

           y = vertical position in the original
           notebook.

           height = only the current page.

           This prevents us from creating one giant
           canvas for the whole notebook.
           ----------------------------------------- */

        let canvas = null;

        try {

            canvas =
                await window.html2canvas(
                    element,
                    {
                        scale: SCALE,

                        backgroundColor:
                            "#ffffff",

                        useCORS: true,

                        allowTaint: false,

                        logging: false,

                        imageTimeout: 15000,

                        width: width,

                        height: currentHeight,

                        x: 0,

                        y: sourceY,

                        windowWidth: width,

                        windowHeight:
                            currentHeight,

                        scrollX: 0,

                        scrollY: 0,

                        foreignObjectRendering:
                            false,

                        removeContainer:
                            true
                    }
                );

        } catch (error) {

            throw new Error(
                `Could not render PDF page ${
                    pageNumber + 1
                }: ${error.message}`
            );

        }


        if (
            !canvas ||
            canvas.width <= 0 ||
            canvas.height <= 0
        ) {

            throw new Error(
                `PDF page ${
                    pageNumber + 1
                } was empty.`
            );

        }


        /* -----------------------------------------
           Add page
           ----------------------------------------- */

        if (pageNumber > 0) {
            pdf.addPage();
        }


        /* -----------------------------------------
           Convert canvas dimensions to PDF mm
           ----------------------------------------- */

        const renderedHeight =
            Math.min(
                CONTENT_HEIGHT,

                currentHeight *
                CONTENT_WIDTH /
                width
            );


        /* -----------------------------------------
           PNG for text-heavy notebook pages.

           This is sharper than the previous JPEG
           version and avoids JPEG artifacts around
           letters, code and equations.
           ----------------------------------------- */

        const imageData =
            canvas.toDataURL(
                "image/png"
            );


        pdf.addImage(
            imageData,

            "PNG",

            MARGIN,

            MARGIN,

            CONTENT_WIDTH,

            renderedHeight,

            undefined,

            "FAST"
        );


        /* -----------------------------------------
           Release memory immediately.

           This is particularly important in Chrome.
           ----------------------------------------- */

        canvas.width = 1;
        canvas.height = 1;

        canvas = null;


        sourceY +=
            currentHeight;

        pageNumber++;


        /*
           Give Chrome/Brave/Firefox a moment to
           release the previous canvas before the
           next one is created.
        */

        await new Promise(resolve => {
            requestAnimationFrame(resolve);
        });


        /*
           Small pause every couple pages.
           This prevents Chrome's renderer from
           getting overwhelmed on long notebooks.
        */

        if (
            pageNumber % 2 === 0
        ) {
            await new Promise(resolve => {
                setTimeout(resolve, 10);
            });
        }

    }


    return pdf;
}
