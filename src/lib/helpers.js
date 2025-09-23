export function d(...msgs) {
    console.log(...msgs);
}

/**
 * @param {function} callback
 * @param {number} wait
 * @returns {(function(...[*]): void)|*}
 */
export function debounce(callback, wait) {
    let timeoutId = null;
    return (...args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
            callback(...args);
        }, wait);
    };
}
