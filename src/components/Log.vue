<script setup>
import {onMounted, ref, watch} from "vue";
import hljs from 'highlight.js/lib/core';

// import 'highlight.js/styles/github.css';
import sql from 'highlight.js/lib/languages/sql';
import {FoundNodes} from "../lib/FoundNodes.js";
import {useConnectionsStore, useLogStore} from "../stores.js";
import {isSelectQuery} from "../helpers.js";
import {getRendererDb} from "../renderer/providers/getRendererDb.js";
import {d} from "../lib/helpers.js";

hljs.registerLanguage('sql', sql);

    const connectionsStore = useConnectionsStore();
    const logStore = useLogStore();
    let scopedCssData = null;
    const $log = ref();
    const searchInput = defineModel('searchInput', { type: String, default: '' });
    const getNextLogId = (function() {
        let logId = 0;
        return () => logId++;
    })();

    // @TODO make date and time configurable
    const dateFormat = new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
    const maxMsgs = 1000; // @TODO make maxMsgs configurable
    const foundNodes = new FoundNodes();
    let lastSearchCondition = null;
    let focusedSearchIndex = -1;
    const totalFound = ref(-1);
    const currentFound = ref(-1);

    const $detailsQuery = ref(null);
    const $indexUsed = ref(null);
    const $explainQuery = ref(null);
    const $explainQueryRes = ref(null);
    const $explainQueryErr = ref(null);

    /**
     * A references to log <div> DOM node, to store related data.
     *
     * @type {WeakMap<WeakKey, any>}
     */
    const logItems$ = new WeakMap();

    window.electronAPI.onProxyMessage(async (message) => {
        // must be an object with a commandByte and query keys in
        if (!(typeof message === 'object' && 'commandByte' in message && 'query' in message)) {
            return;
        }

        const now = new Date();
        const date = dateFormat.format(now);
        const time = timeFormat.format(now);

        const metaShort = [];
        let dateHtml = `${date} ${time}`;
        let shortMetaHtml = '';
        let queryHtml = '';
        switch (message.commandByte) {
            case 3: // COM_QUERY
                queryHtml = highlightSql(message.query);
                break;

            // COM_STMT_PREPARE (22) queries come combined in COM_STMT_EXECUTE (23)
            // case 22: // COM_STMT_PREPARE
            //     output = `<span class="small" data-${scopedCssData}>${date} ${time}:</span> ${highlightSql(message.query)}`;
            //     break;

            case 23: // COM_STMT_EXECUTE
                // formatting the values

                // console.error('Amount of parameters and placeholders in query is different.',
                //     message.statement.query, message.statement.paramValues);
                //
                // alert('Error. Amount of parameters and placeholders in query is different.'
                //     +' Check Chrome Developer Console for details.');

                queryHtml = highlightSql(message.query);
                break;

            case 24: // COM_LONG_DATA
                queryHtml = '(COM_LONG_DATA NOT IMPLEMENTED)';
                break;
        }

        if ((dateHtml || shortMetaHtml || queryHtml) && $log.value) {
            const logId = getNextLogId();

            const scrolledToBottom = isScrolledToBottom($log.value);

            const $tpl = [
                `<div class="log-date" data-${scopedCssData}>${dateHtml}</div>`,
                `<div class="log-meta-short" data-${scopedCssData}>${shortMetaHtml}</div>`,
                `<div class="log-query" data-${scopedCssData}>${queryHtml}</div>`,
            ].join('');

            const $div = document.createElement('div');
            $div.id = `logId_${logId}`;
            $div.classList.add('log-container');
            $div.innerHTML = $tpl;
            $div.dataset[scopedCssData] = '';
            $div.dataset.timestamp = now.getTime().toString();
            $div.dataset.searchMessage = message.query.toLowerCase();
            $div.style.paddingTop = '6px'; // Bootstrap's mt-2 is not enough, and mt-3 is too much

            const logItem = {};
            logItems$.set($div, logItem);

            $log.value.appendChild($div);

            // @TODO keep focus if scrolled, provide a button to scroll to bottom
            // Scroll to the bottom when new messages are added. Only if previously the list was not scrolled already
            if (scrolledToBottom) {
                $log.value.scrollTop = $log.value.scrollHeight;
            }

            if (lastSearchCondition) {
                const $foundNodes = searchNodes(lastSearchCondition, [$div]);
                highlightNodes($foundNodes);
            }

            if (logStore.checkQueryIndexesUsage && isSelectQuery(message.query)) {
                const explainHtml =  [
                    `<span class="log-meta-short-explain" data-${scopedCssData}>`,
                    `Explain: <span class="log-meta-short-explain-status" data-${scopedCssData}>⌛</span>`,
                    '</span>'
                ].join('');
                appendMetaShort($div, explainHtml);

                const indexUsedHtml = [
                    `<span class="log-meta-short-index-used" data-${scopedCssData}>`,
                    `Index Used: <span class="log-meta-short-index-used-status" data-${scopedCssData}>⌛</span>`,
                    '</span>'
                ].join('');
                appendMetaShort($div, indexUsedHtml);

                const explainQuery = makeExplainQuery(message.query);
                try {
                    logItem.explain = await explainQuery$(explainQuery);
                    logItem.explain.indexUsed = isExplainUsed(logItem.explain);
                } catch (ex) {
                    logItem.explain = ex;
                    logItem.explain.indexUsed = false;
                }
                logItem.explain.query = explainQuery;

                renderQueryExplain($div);
                renderIndexUsed($div);
            }

            const viewDetailsHtml = [
                '<span class="log-meta-short-view-details modal-link" data-bs-toggle="modal" ',
                `data-bs-target="#query-details" data-${scopedCssData}>View details</span>`
            ].join('');
            appendMetaShort($div, viewDetailsHtml);
        }
    });

    /**
     * @param {{}} explainResp
     * @returns {boolean}
     */
    function isExplainUsed(explainResp) {
        return explainResp.ok
            && explainResp.result
            && explainResp.result.rows
            && explainResp.result.rows.length
            && explainResp.result.rows[0].key;
    }

    /**
     * @param {HTMLDivElement} $div
     * @param {string} metaShort
     */
    function appendMetaShort($div, metaShort) {
        $div.querySelector('.log-meta-short').innerHTML += ` | ${metaShort}`;
    }

    /**
     * @param {HTMLDivElement} $div
     */
    function renderQueryExplain($div) {
        const logItem = logItems$.get($div);
        const $status = $div.querySelector('.log-meta-short-explain-status');

        if (logItem && 'explain' in logItem) {
            $status.innerHTML = logItem.explain.ok ? '✔' : '❌';
        } else {
            $status.innerHTML = '⌛';
        }
    }

    /**
     * @param {HTMLDivElement} $div
     */
    function renderIndexUsed($div) {
        const logItem = logItems$.get($div);
        const $status = $div.querySelector('.log-meta-short-index-used-status');

        if (logItem && 'explain' in logItem && 'indexUsed' in logItem.explain) {
            $status.innerHTML = logItem.explain.indexUsed ? '✔' : '❌';
        } else {
            $status.innerHTML = '⌛';
        }
    }

    /**
     * @param {string} sqlQuery
     * @returns {string}
     */
    function makeExplainQuery(sqlQuery) {
        return `EXPLAIN ${sqlQuery}`;
    }

    /**
     * @param {string} explainSqlQuery EXPLAIN SELECT SQL query
     * @returns {Promise<string>}
     */
    async function explainQuery$(explainSqlQuery) {
        const db = getRendererDb();

        // @TODO optimize. Send this query only once, before DB change in UI
        // switch to the right DB
        await db.fetch$(`USE \`${connectionsStore.mysqlServerDatabase}\``);

        // Construct an EXPLAIN query to analyze the indexes used
        return await db.fetch$(explainSqlQuery);
    }

    /**
     * @param {string} query
     * @returns {string}
     */
    function highlightSql(query) {
        return hljs.highlight(query, { language: 'sql' }).value;
    }

    /**
     * @param {HTMLElement} $container
     */
    function onViewDetailsClicked($container) {
        const $queryNode = $container.querySelector('.log-query');
        $detailsQuery.value = $queryNode ? $queryNode.innerHTML : null;

        const logItem = logItems$.get($container);

        $explainQuery.value = logItem?.explain?.query ? highlightSql(logItem.explain.query) : null;

        const firstRow = logItem
                  && logItem.explain
                  && logItem.explain.ok
                  && logItem.explain.result
                  && Array.isArray(logItem.explain.result.rows)
                  && logItem.explain.result.rows.length
                            ? logItem.explain.result.rows[0]
                            : null;
        $explainQueryRes.value = firstRow ? dbRowToKeyValueHtmlTable(firstRow) : null;

        const hasExplain = !logItem?.explain?.error && logItem?.explain;
        $indexUsed.value = hasExplain ? (logItem?.explain?.indexUsed ? '✔' : '❌') : null;

        $explainQueryErr.value = logItem?.explain?.error ?? null;
    }

    /**
     * @param {{}} row
     * @returns {string}
     */
    function dbRowToKeyValueHtmlTable(row) {
        const html = ['<table class="table table-striped"><col width="1">'];
        for (const column in row) {
            // @TODO HTML escape
            html.push(`<tr><td scope="row">${column}</td><td>${row[column]}</td></tr>`);
        }
        html.push('</table>');
        return html.join('');
    }

    function search() {
        const condition = searchInput.value.trim().toLowerCase();
        if (condition === '') {
            // input was empty, reset the search functionality
            clearSearch();
            return;
        }

        // search condition has changed and the Search button clicked
        let newFocusIndex;
        if (lastSearchCondition !== condition) {
            clearSearch();

            // clearNodesHighlight(foundNodes.getNodes());
            foundNodes.clearNodes();

            const $nodes = searchNodes(condition);
            highlightNodes($nodes);
            newFocusIndex = foundNodes.getNodesLength() - 1;
            lastSearchCondition = condition;
        } else {
            // same search condition as before and the Search button clicked
            newFocusIndex = focusedSearchIndex + 1;
            if (newFocusIndex > foundNodes.getNodesLength() - 1) {
                newFocusIndex = 0;
            }
        }

        focusSearchIndex(newFocusIndex);
    }

    function clearSearch() {
        for (const $msg of $log.value.childNodes) {
            $msg.classList.remove('highlight');
            $msg.classList.remove('selected');
        }

        lastSearchCondition = null;
        focusedSearchIndex = -1;
        totalFound.value = -1;
        currentFound.value = -1;
    }

    /**
     * @param {string} condition
     * @param {HTMLElement[]|null} $nodes
     */
    function searchNodes(condition, $nodes = null) {
        if (!$nodes) {
            // when there are no nodes supplied, let's use the whole list of nodes
            $nodes = $log.value.childNodes;
        }

        // iterate messages
        const res = [];
        for (const $node of $nodes) {
            if ('searchMessage' in $node.dataset && $node.dataset.searchMessage.includes(condition)) {
                res.push($node);
            }
        }

        // when $nodes is supplied, we are searching the whole log, otherwise only the subset
        totalFound.value = $nodes ? (totalFound.value < 0 ? 0 : totalFound.value) + res.length : res.length;

        if (!$nodes) {
            currentFound.value = 0;
        }
        return res;
    }

    /**
     * @param {HTMLElement[]} $nodes
     */
    function highlightNodes($nodes) {
        for (const $node of $nodes) {
            $node.classList.add('highlight');
            foundNodes.addNode($node);
        }
    }

    /**
     * @param {HTMLElement[]} $nodes
     */
    function clearNodesHighlight($nodes) {
        for (const $node of $nodes) {
            $node.classList.remove('highlight');
        }
    }

    /**
     * @param {number} index
     * @TODO make search lazy
     */
    function focusSearchIndex(index) {
        const $node = foundNodes.getNode(index);
        if (!$node) {
            // node does not exist. We do nothing
            return;
        }

        if (focusedSearchIndex !== -1 && focusedSearchIndex !== index) {
            // if the highlighted node has changed, remove highlight from the previous node
            foundNodes.getNode(focusedSearchIndex)?.classList.remove('selected');
        }

        focusedSearchIndex = index;

        currentFound.value = index + 1 > totalFound.value ? index : index + 1;

        $node.classList.add('selected');

        // @TODO add animation
        // scroll to the element
        $node.scrollIntoView();
    }

    function clearLog() {
        if (confirm('Are you sure you want to clear the log?')) {
            $log.value.innerHTML = '';
        }
    }

    /**
     * @param {HTMLElement} $node
     * @returns {boolean}
     */
    function isScrolledToBottom($node) {
        // Add a small tolerance for floating point inaccuracies or slight variations
        // in browser rendering. A value of 1 or 2 is usually sufficient.
        const tolerance = 1;
        return $node.scrollHeight - $node.scrollTop - $node.clientHeight <= tolerance;
    }

    function initScopedCssData() {
        for (const key in $log.value.dataset) {
            if (key.startsWith('v-')) {
                scopedCssData = key;
                break;
            }
        }
    }

    watch(
        () => logStore.clearSignal,
        (newValue, oldValue) => {
            if (newValue > 0 && newValue !== oldValue) {
                clearLog();
            }
        }
    );

    watch(
        () => logStore.checkQueryIndexesUsage,
        (newValue, oldValue) => {
            if (newValue && newValue !== oldValue) {
                // @TODO analyze existing queries
            }
        }
    );

    /**
     * @param {PointerEvent} ev
     */
    function logClicked(ev) {
        const $target = ev.target;
        if (!($target instanceof HTMLElement)) {
            return;
        }

        const $container = $target.closest('.log-container');
        if ($container) {
            onViewDetailsClicked($container);
        }
    }

    onMounted(function() {
        initScopedCssData();

        // handle too many messages once every 10 seconds
        // delete all log entries above the maxMsgs amount, if maxMsgs > 0
        setInterval(() => {
            if (!$log || !maxMsgs) {
                return;
            }

            const $logValue = $log.value;
            if (!$logValue) {
                return;
            }

            const $logChildNodes = $logValue.childNodes;
            const msgsAmount = $logChildNodes.length;
            if (msgsAmount > maxMsgs) {
                const amountToDelete = msgsAmount - maxMsgs;
                for (let i = 0; i < amountToDelete; i++) {
                    if (!$logValue.childNodes.length) {
                        break;
                    }
                    // always delete the top most node
                    $logValue.removeChild($logValue.childNodes[0]);
                }
            }
        }, 9999);
    });
</script>

<template>
    <div class="main-content">
        <div class="p-2 border-bottom" style="padding: 12px 40px 12px 40px !important;">
            <form class="d-flex">
                <input class="form-control me-2" type="search" placeholder="Type your search criteria" aria-label="Search" v-model="searchInput" @search="search">
                <button class="btn btn-outline-success text-nowrap" @click.prevent="search">{{totalFound === -1 ? 'Search' : `Search (${currentFound > 0 ? currentFound : 0}/${totalFound})`}}</button>
            </form>
        </div>
        <div class="overflow-auto p-2 log" ref="$log" @click="logClicked">
            <i>Start the proxy server to collect logs...</i>
        </div>
    </div>

    <div class="modal fade" id="query-details" tabindex="-1" aria-labelledby="query-details-label" aria-hidden="true">
        <div class="modal-dialog modal-almost-fullscreen">
            <div class="modal-content">
                <div class="modal-header">
                    <div>
                        <h1 class="modal-title fs-5" id="query-details-label">Query details</h1>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">Query</label>
                        <div v-html="$detailsQuery"></div>
                    </div>
                    <div class="mb-3" v-if="$indexUsed">
                        <label class="form-label">Index Used</label>
                        <div>{{ $indexUsed }}</div>
                    </div>
                    <div class="mb-3" v-if="$explainQuery">
                        <label class="form-label">Explain Query</label>
                        <div v-html="$explainQuery"></div>
                    </div>
                    <div class="mb-3" v-if="$explainQueryRes">
                        <label class="form-label">Explain Query Result</label>
                        <div v-html="$explainQueryRes"></div>
                    </div>
                    <div class="mb-3" v-if="$explainQueryErr">
                        <label class="form-label">Explain Query Error</label>
                        <div>{{ $explainQueryErr }}</div>
                    </div>
                </div>
<!--                <div class="modal-footer">-->
<!--                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>-->
<!--                    <button type="button" class="btn btn-primary">Save changes</button>-->
<!--                </div>-->
            </div>
        </div>
    </div>
</template>

<style scoped>
    .log-container {
        margin-bottom: 10px;
    }
    .log-date {
        font-size: 0.6em;
        line-height: 0.6em;
        float: left;
    }
    .log-meta-short {
        font-size: 0.6em;
        line-height: 0.6em;
        float: left;
    }
    .log-query {
        clear: both;
        line-height: 1.4em;
    }

    .log {
        width: 100%;
        height: calc(100vh - 60px);
        overflow: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    .main-content {
        display: flex;
        flex-direction: column;
        height: 100vh;
        flex: 1;
        overflow: hidden;
    }

    .selected {
        background: #ab6c02;
    }
    [data-bs-theme=dark] .selected {
        background: red;
    }

    .highlight {
        background: #ffff00;
    }
    [data-bs-theme=dark] .highlight {
        background: #bf7c0a;
    }

    .modal-link {
        color: #0d6efd;
        border-bottom: 1px dashed #0d6efd;
        cursor: pointer;
    }

    .modal-almost-fullscreen {
        width: 90vw;
        max-width: none;
        /*height: 90%;*/
        margin: 5vw 5vw;
    }

    .form-label {
        font-weight: bold;
    }
</style>
