export function getParameterByName(name, url) {
    if (!url) {
        url = window.location.href;
    }
    name = name.replace(/[\[\]]/g, "\\$&");
    let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
    let results = regex.exec(url);
    if (!results) {
        return null;
    }
    if (!results[2]) {
        return "";
    }
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

export function getParameterByNameInt(name, url) {
    const str = getParameterByName(name, url);
    if (!str) {
        return undefined;
    }
    return parseInt(str);
}

export function replaceUrlParam(url, paramName, paramValue) {
    if (paramValue == null) {
        paramValue = "";
    }
    var pattern = new RegExp("\\b(" + paramName + "=).*?(&|#|$)");
    if (url.search(pattern) >= 0) {
        return url.replace(pattern, "$1" + paramValue + "$2");
    }
    url = url.replace(/[?#]$/, "");
    return (
        url + (url.indexOf("?") > 0 ? "&" : "?") + paramName + "=" + paramValue
    );
}
