/*jslint this: true, browser: true, for: true, long: true */
/*global window console accountKey run processError */

let requestCount = 0;
let timer;
const requestQueue = [];
const instrumentIds = [];

function updateOutput() {
    document.getElementById("idInstruments").value = instrumentIds.join(",");
    console.log("Found in total " + instrumentIds.length + " instruments..");
}

function processDetailResponse(assetType, responseJson) {
    const uics = responseJson.Data.map(i => i.Uic)
    instrumentIds.push(...uics)
    updateOutput()
}

function processContractOptionSpace(assetType, responseJson) {
    const uics = responseJson.OptionSpace.map(os => os.SpecificOptions.map(so => so.Uic))
    instrumentIds.push(...uics)
    updateOutput()
}

function processSearchResponse(assetType, responseJson) {
    const baseUrl = "https://gateway.saxobank.com/sim/openapi/ref/v1/instruments/details?AccountKey=" + encodeURIComponent(accountKey) + "&$top=1000&AssetTypes=" + assetType + "&Uics=";
    let url = "";
    const separator = encodeURIComponent(",");

    function addToQueue() {
        requestQueue.push({
            "assetType": assetType,
            "url": url,
            "callback": processDetailResponse
        });
    }

    console.log("Found " + responseJson.Data.length + " instruments on this exchange");
    // We have the Uic - collect the details

    responseJson.Data.forEach(result => {
        if (assetType === "StockOption" || assetType === "StockIndexOption") {
            // We found an OptionRoot - this must be converted to Uic
            requestQueue.push({
                "assetType": assetType,
                "url": "https://gateway.saxobank.com/sim/openapi/ref/v1/instruments/contractoptionspaces/" + result.Identifier + "?OptionSpaceSegment=AllDates",
                "callback": processContractOptionSpace
            });
        } else {
            url += (url === "" ? baseUrl : separator) + result.Identifier;
            if (url.length > 2000) {
                addToQueue();
                url = "";
            }
        }
    })
    
    if (url !== "") {
        addToQueue();
    }
    if (responseJson.hasOwnProperty("__next")) {
        // Recursively get next bulk
        console.log("Found '__next': " + responseJson.__next);
        requestQueue.push({
            "assetType": assetType,
            "url": responseJson.__next,
            "callback": processSearchResponse
        });
    }
}

function processExchangesResponse(assetType, responseJson) {
    console.log("Found " + responseJson.Data.length + " exchanges, starting to collect instrument ids");
    for (i = 0; i < responseJson.Data.length; i += 1) {
        
    }

    responseJson.Data.forEach(exchange => {
        requestQueue.push({
            "assetType": assetType,
            "url": "https://gateway.saxobank.com/sim/openapi/ref/v1/instruments?ExchangeId=" + encodeURIComponent(exchange.ExchangeId) + "&AssetTypes=" + assetType + "&IncludeNonTradable=false&$top=1000&AccountKey=" + encodeURIComponent(accountKey),
            "callback": processSearchResponse
        });
    })

}

/**
 * This is an example of getting all instruments.
 * @return {void}
 */
function start() {
    requestQueue.push({
        "assetType": "ContractFutures",
        "url": "https://gateway.saxobank.com/sim/openapi/ref/v1/exchanges?$top=1000",
        "callback": processExchangesResponse
    },{
        "assetType": "Stock",
        "url": "https://gateway.saxobank.com/sim/openapi/ref/v1/exchanges?$top=1000",
        "callback": processExchangesResponse
    },{
        "assetType": "StockOption",
        "url": "https://gateway.saxobank.com/sim/openapi/ref/v1/exchanges?$top=1000",
        "callback": processExchangesResponse
    },{
        "assetType": "StockIndexOption",
        "url": "https://gateway.saxobank.com/sim/openapi/ref/v1/exchanges?$top=1000",
        "callback": processExchangesResponse
    });
}

function runJobFromQueue() {
    let job;
    if (requestQueue.length > 0) {
        job = requestQueue.shift();
        document.getElementById("idResponse").innerText = "Processing job for AssetType " + job.assetType + ":\r\n" + job.url + "\r\nRequests: " + requestCount + "\r\nJobs in queue: " + requestQueue.length;
        fetch(
            job.url,
            {
                "headers": {
                    "Content-Type": "application/json; charset=utf-8",
                    "Authorization": "Bearer " + document.getElementById("idBearerToken").value
                },
                "method": "GET"
            }
        ).then(function (response) {
            if (response.ok) {
                response.json().then(function (responseJson) {
                    job.callback(job.assetType, responseJson);
                });
            } else {
                processError(response);
            }
        }).catch(function (error) {
            processNetworkError(error);
        });
        requestCount += 1;
    }
}

(function () {
    const refLimitPerMinute = 60;
    timer = setInterval(runJobFromQueue, (refLimitPerMinute / 60 * 1000) + 25);  // A little more, to prevent risk of 429 TooManyRequests

    document.getElementById("idBtnStart").addEventListener("click", function () {
        run(start);
    });
}());
