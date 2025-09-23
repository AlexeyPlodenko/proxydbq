import {d} from "./helpers.js";

export class FoundNodes {
    /** @type {HTMLElement[]} */
    #$nodes = [];

    clearNodes() {
        this.#$nodes.length = 0;
    }

    /**
     * @param {number} index
     * @returns {HTMLElement|null}
     */
    getNode(index) {
        return index in this.#$nodes ? this.#$nodes[index] : null;
    }

    /**
     * @param {HTMLElement[]} nodes
     */
    setNodes(nodes) {
        this.#$nodes = nodes;
    }

    /**
     * @param {HTMLElement} $node
     */
    addNode($node) {
        this.#$nodes.push($node);
    }

    /**
     * @returns {number}
     */
    getNodesLength() {
        return this.#$nodes.length;
    }

    /**
     * @returns {HTMLElement[]}
     */
    getNodes() {
        return this.#$nodes;
    }
}
