<script setup>
    import {onMounted, ref, watch} from "vue";
    import hljs from 'highlight.js/lib/core';
    // import 'highlight.js/styles/github.css';
    import sql from 'highlight.js/lib/languages/sql';
    import {FoundNodes} from "../lib/FoundNodes.js";
    import {useConnectionsStore, useLogStore} from "../stores.js";
    import {beautifySql, isSelectQuery} from "../helpers.js";
    import {getRendererDb} from "../renderer/providers/getRendererDb.js";
    import {d} from "../lib/helpers.js";

    hljs.registerLanguage('sql', sql);

    const connectionsStore = useConnectionsStore();
    const logStore = useLogStore();
    let scopedCssData = null;
    const $log = ref();
    const $scrollContainer = ref();
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
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const maxMsgs = 1000; // @TODO make maxMsgs configurable
    const foundNodes = new FoundNodes();
    let lastSearchCondition = null;
    let focusedSearchIndex = -1;
    const totalFound = ref(-1);
    const currentFound = ref(-1);
    const isSlowQuery = ref(false);

    const $detailsQuery = ref(null);
    const currentLogContainer = ref(null);
    const modalBeautifyText = ref('Beautify query');
    const $indexUsed = ref(null);
    const $explainQuery = ref(null);
    const $explainQueryRes = ref(null);
    const $explainQueryErr = ref(null);
    const $queryDetailsTimes = ref(null);

    const zoomLevel = ref(1);
    const showOnlySaved = ref(false);

    /**
     * A references to log <div> DOM node, to store related data.
     *
     * @type {WeakMap<WeakKey, any>}
     */
    const logItems$ = new WeakMap();

    /**
     * Stores session group references.
     * @type {Ref<Map<any, {$group: HTMLDivElement, $container: HTMLDivElement}>>}
     */
    const sessionGroups = ref(new Map());

    function logSystemMessage(text, timestamp) {
        if (!$log.value) return;

        const now = timestamp ? new Date(timestamp) : new Date();
        const date = dateFormat.format(now);
        const time = timeFormat.format(now);

        const logId = getNextLogId();
        const scrolledToBottom = isScrolledToBottom($scrollContainer.value);

        const dateHtml = `${date} ${time}`;
        const queryHtml = `<span class="text-info">${text}</span>`;

        const $tpl = [
            `<div class="log-date" data-${scopedCssData}>${dateHtml}</div>`,
            `<div class="log-meta-short" data-${scopedCssData}></div>`,
            `<div class="log-query" data-${scopedCssData}>${queryHtml}</div>`,
        ].join('');

        const $div = document.createElement('div');
        $div.id = `logId_${logId}`;
        $div.classList.add('log-container');
        $div.innerHTML = $tpl;
        $div.dataset[scopedCssData] = '';
        $div.dataset.timestamp = now.getTime().toString();
        $div.dataset.searchMessage = text.toLowerCase();
        $div.style.paddingTop = '6px';

        $log.value.appendChild($div);
        updateNodeVisibility($div);

        if (scrolledToBottom) {
            $scrollContainer.value.scrollTop = $scrollContainer.value.scrollHeight;
        }
    }

    /**
     * @param {any} connectionId
     * @returns {{$group: HTMLDivElement, $container: HTMLDivElement}}
     */
    function getOrCreateSessionGroup(connectionId) {
        if (sessionGroups.value.has(connectionId)) {
            return sessionGroups.value.get(connectionId);
        }

        const $group = document.createElement('div');
        $group.classList.add('session-group');
        $group.dataset[scopedCssData] = '';

        const $header = document.createElement('div');
        $header.classList.add('session-header');
        $header.dataset[scopedCssData] = '';
        $header.innerHTML = `<i class="bi bi-chevron-down me-2 toggle-icon"></i>Session #${connectionId}`;
        $header.onclick = () => toggleSession($group);
        $group.appendChild($header);

        const $wrapper = document.createElement('div');
        $wrapper.classList.add('session-container-wrapper');
        $wrapper.dataset[scopedCssData] = '';

        const $container = document.createElement('div');
        $container.classList.add('session-container');
        $container.dataset[scopedCssData] = '';

        $wrapper.appendChild($container);
        $group.appendChild($wrapper);

        $log.value.appendChild($group);

        const groupData = {$group, $container};
        sessionGroups.value.set(connectionId, groupData);
        return groupData;
    }

    /**
     * @param {HTMLElement} $group
     */
    function toggleSession($group) {
        const $icon = $group.querySelector('.toggle-icon');
        if ($group.classList.contains('collapsed')) {
            $group.classList.remove('collapsed');
            $icon.classList.replace('bi-chevron-right', 'bi-chevron-down');
        } else {
            $group.classList.add('collapsed');
            $icon.classList.replace('bi-chevron-down', 'bi-chevron-right');
        }
    }

    window.electronAPI.onProxyMessage(async (message) => {
        // must be an object with a commandByte and query keys in
        if (!(typeof message === 'object' && 'commandByte' in message && 'query' in message)) {
            return;
        }

        const $existingDiv = message.id ? document.getElementById(`logQueryId_${message.id}`) : null;

        if ($existingDiv) {
            const logItem = logItems$.get($existingDiv);
            if (logItem) {
                logItem.sendTime = message.sendTime;
                logItem.processTime = message.processTime;
                logItem.responseTime = message.responseTime;
                renderQueryTime($existingDiv);
                return;
            }
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

            case 23: // COM_STMT_EXECUTE
                queryHtml = highlightSql(message.query);
                break;

            case 24: // COM_LONG_DATA
                queryHtml = '(COM_LONG_DATA NOT IMPLEMENTED)';
                break;
        }

        if ((dateHtml || shortMetaHtml || queryHtml) && $log.value) {
            const logId = getNextLogId();

            const scrolledToBottom = isScrolledToBottom($scrollContainer.value);

            const $tpl = [
                `<i class="log-star bi bi-star cursor-pointer me-1" data-${scopedCssData}></i>`,
                `<div class="log-date" data-${scopedCssData}>${dateHtml}</div>`,
                `<div class="log-meta-short" data-${scopedCssData}>${shortMetaHtml}</div>`,
                `<div class="log-query" data-${scopedCssData}>${queryHtml}</div>`,
            ].join('');

            const $div = document.createElement('div');
            $div.id = message.id ? `logQueryId_${message.id}` : `logId_${logId}`;
            $div.classList.add('log-container');
            $div.innerHTML = $tpl;
            $div.dataset[scopedCssData] = '';
            $div.dataset.timestamp = now.getTime().toString();
            $div.dataset.searchMessage = message.query.toLowerCase();
            $div.style.paddingTop = '6px'; // Bootstrap's mt-2 is not enough, and mt-3 is too much

            const logItem = {
                rawQuery: message.query,
                isBeautified: false,
                isSaved: false, // Initialize isSaved for this specific log entry
                sendTime: message.sendTime,
                processTime: message.processTime,
                responseTime: message.responseTime,
                connectionId: message.connectionId,
            };
            logItems$.set($div, logItem);

            if (logStore.groupSessionQueries && message.connectionId) {
                const group = getOrCreateSessionGroup(message.connectionId);
                group.$container.appendChild($div);
            } else {
                $log.value.appendChild($div);
            }

            updateNodeVisibility($div);
            if (logStore.groupSessionQueries && message.connectionId && showOnlySaved.value) {
                updateSessionGroupsVisibility();
            }

            // @TODO keep focus if scrolled, provide a button to scroll to bottom
            // Scroll to the bottom when new messages are added. Only if previously the list was not scrolled already
            if (scrolledToBottom) {
                $scrollContainer.value.scrollTop = $scrollContainer.value.scrollHeight;
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

            const timeHtml = [
                `<span class="log-meta-short-time" data-${scopedCssData}></span>`
            ].join('');
            appendMetaShort($div, timeHtml);
            renderQueryTime($div);

            const viewDetailsHtml = [
                '<span class="log-meta-short-view-details modal-link" data-bs-toggle="modal" ',
                `data-bs-target="#query-details" data-${scopedCssData}>View details</span>`
            ].join('');
            appendMetaShort($div, viewDetailsHtml);

            const beautifyHtml = [
                `<span class="log-meta-short-beautify modal-link" data-${scopedCssData}>Beautify query</span>`
            ].join('');
            appendMetaShort($div, beautifyHtml);

            renderSavedStatus($div);
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
        const $meta = $div.querySelector('.log-meta-short');
        $meta.innerHTML += ` | ${metaShort}`;
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
     * @param {HTMLDivElement} $div
     */
    function renderQueryTime($div) {
        const logItem = logItems$.get($div);
        const $time = $div.querySelector('.log-meta-short-time');
        if (!$time) return;

        if (logItem && logItem.responseTime !== null) {
            const total = logItem.responseTime;
            $time.innerHTML = `${total}ms`;

            if (total > Number(logStore.slowQueryThresholdMs)) {
                $time.classList.add('text-danger', 'fw-bold');
            } else {
                $time.classList.remove('text-danger', 'fw-bold');
            }
        } else {
            $time.innerHTML = '⌛';
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
        currentLogContainer.value = $container;
        const $queryNode = $container.querySelector('.log-query');
        $detailsQuery.value = $queryNode ? $queryNode.innerHTML : null;

        const logItem = logItems$.get($container);
        modalBeautifyText.value = logItem?.isBeautified ? 'Show original' : 'Beautify query';

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

        if (logItem && logItem.responseTime !== null) {
            const total = logItem.responseTime;
            $queryDetailsTimes.value = `Process time: ${logItem.processTime}ms, Total time: ${total}ms`;
            isSlowQuery.value = total > Number(logStore.slowQueryThresholdMs);
        } else {
            $queryDetailsTimes.value = null;
            isSlowQuery.value = false;
        }
    }

    /**
     * @param {HTMLElement} $container
     * @param {HTMLElement} $target
     */
    function onBeautifyClicked($container, $target) {
        const logItem = logItems$.get($container);
        if (!logItem || !logItem.rawQuery) {
            return;
        }

        const $queryNode = $container.querySelector('.log-query');
        if (!$queryNode) {
            return;
        }

        if (logItem.isBeautified) {
            $queryNode.innerHTML = highlightSql(logItem.rawQuery);
            $target.innerText = 'Beautify query';
            logItem.isBeautified = false;
        } else {
            const beautified = beautifySql(logItem.rawQuery);
            $queryNode.innerHTML = highlightSql(beautified);
            $target.innerText = 'Show original';
            logItem.isBeautified = true;
        }
    }

    function onModalBeautifyClicked() {
        if (!currentLogContainer.value) {
            return;
        }

        const $beautifyLink = currentLogContainer.value.querySelector('.log-meta-short-beautify');
        if ($beautifyLink) {
            onBeautifyClicked(currentLogContainer.value, $beautifyLink);

            const logItem = logItems$.get(currentLogContainer.value);
            const $queryNode = currentLogContainer.value.querySelector('.log-query');
            $detailsQuery.value = $queryNode ? $queryNode.innerHTML : null;
            modalBeautifyText.value = logItem.isBeautified ? 'Show original' : 'Beautify query';
        }
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

    function toggleShowOnlySaved() {
        showOnlySaved.value = !showOnlySaved.value;
        applyVisibilityFilter();
    }

    function applyVisibilityFilter() {
        if (!$log.value) return;
        const allLogContainers = $log.value.querySelectorAll('.log-container');
        for (const $div of allLogContainers) {
            updateNodeVisibility($div);
        }
        updateSessionGroupsVisibility();
    }

    function updateNodeVisibility($div) {
        const logItem = logItems$.get($div);
        if (showOnlySaved.value) {
            const isSaved = logItem && logItem.isSaved; // Check logItem.isSaved
            $div.style.display = isSaved ? '' : 'none';
        } else {
            $div.style.display = '';
        }
    }

    function updateSessionGroupsVisibility() {
        if (!$log.value) return;
        const allGroups = $log.value.querySelectorAll('.session-group');
        for (const $group of allGroups) {
            const $container = $group.querySelector('.session-container');
            const hasVisibleChildren = Array.from($container.childNodes).some($node => $node.style.display !== 'none');
            $group.style.display = hasVisibleChildren ? '' : 'none';
        }
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
        if ($log.value) {
            const allLogContainers = $log.value.querySelectorAll('.log-container');
            for (const $msg of allLogContainers) {
                $msg.classList.remove('highlight');
                $msg.classList.remove('selected');
            }
        }

        foundNodes.clearNodes();
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
            $nodes = $log.value.querySelectorAll('.log-container');
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

            // If a node is highlighted, ensure its parent session group is expanded
            const $group = $node.closest('.session-group');
            if ($group && $group.classList.contains('collapsed')) {
                toggleSession($group);
            }
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
        if (!$log.value) return;
        if (confirm('Are you sure you want to clear the log?')) {
            const allLogContainers = Array.from($log.value.querySelectorAll('.log-container'));
            for (const $div of allLogContainers) {
                const logItem = logItems$.get($div);
                if (!logItem || !logItem.isSaved) { // Check logItem.isSaved
                    $div.parentNode.removeChild($div);
                }
            }

            // Always clear the session mapping so new sessions start fresh
            // even if old starred queries from those sessions remain in the DOM.
            sessionGroups.value.clear();

            // Cleanup empty session groups from DOM
            const allGroups = Array.from($log.value.querySelectorAll('.session-group'));
            for (const $group of allGroups) {
                const $container = $group.querySelector('.session-container');
                if ($container && $container.childNodes.length === 0) {
                    $group.parentNode.removeChild($group);
                }
            }

            clearSearch();
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

    watch(
        () => logStore.systemMessage,
        (newValue) => {
            if (newValue) {
                logSystemMessage(newValue.text, newValue.timestamp);
            }
        }
    );

    watch(
        () => logStore.slowQueryThresholdMs,
        () => {
            if (!$log.value) return;
            const allLogContainers = $log.value.querySelectorAll('.log-container');
            for (const $div of allLogContainers) {
                renderQueryTime($div);
            }
        }
    );

    watch(
        () => logStore.groupSessionQueries,
        (newValue) => {
            if (!$log.value) return;

            if (newValue) {
                // Enable grouping: move existing containers into session groups
                const allLogContainers = Array.from($log.value.querySelectorAll('.log-container'));
                for (const $div of allLogContainers) {
                    const logItem = logItems$.get($div);
                    if (logItem && logItem.connectionId) {
                        const group = getOrCreateSessionGroup(logItem.connectionId);
                        group.$container.appendChild($div);
                    }
                }
                updateSessionGroupsVisibility();
            } else {
                // Disable grouping: move all containers back to the root $log and remove group elements
                const allLogContainers = Array.from($log.value.querySelectorAll('.log-container'));
                for (const $div of allLogContainers) {
                    $div.style.display = ''; // Ensure they are visible when ungrouping, though they should be
                    $log.value.appendChild($div);
                }

                // Remove all session group elements
                const allGroups = $log.value.querySelectorAll('.session-group');
                for (const $group of allGroups) {
                    $group.parentNode.removeChild($group);
                }
                sessionGroups.value.clear();
                applyVisibilityFilter(); // Re-apply filter for flat list
            }
        }
    );

    /**
     * @param {HTMLElement} $container
     */
    function onSaveQueryClicked($container) {
        const logItem = logItems$.get($container);
        if (logItem) {
            logItem.isSaved = !logItem.isSaved; // Toggle isSaved directly on the logItem
            renderSavedStatus($container);
        }
    }

    /**
     * @param {HTMLDivElement} $div
     */
    function renderSavedStatus($div) {
        const logItem = logItems$.get($div);
        const $star = $div.querySelector('.log-star');
        if (logItem && $star) {
            if (logItem.isSaved) { // Check logItem.isSaved
                $star.classList.replace('bi-star', 'bi-star-fill');
                $star.classList.add('text-warning');
            } else {
                $star.classList.replace('bi-star-fill', 'bi-star');
                $star.classList.remove('text-warning');
            }
        }
        updateNodeVisibility($div);
        if (logStore.groupSessionQueries) {
            updateSessionGroupsVisibility();
        }
    }

    /**
     * @param {PointerEvent} ev
     */
    function logClicked(ev) {
        const $target = ev.target;
        if (!($target instanceof HTMLElement)) {
            return;
        }

        const $container = $target.closest('.log-container');
        if (!$container) {
            return;
        }

        if ($target.classList.contains('log-meta-short-beautify')) {
            onBeautifyClicked($container, $target);
        } else if ($target.classList.contains('log-star')) {
            onSaveQueryClicked($container);
        } else {
            onViewDetailsClicked($container);
        }
    }

    /**
     * @param {WheelEvent} ev
     */
    function handleWheel(ev) {
        if (ev.ctrlKey) {
            ev.preventDefault();
            const delta = ev.deltaY > 0 ? -0.1 : 0.1;
            zoomLevel.value = Math.min(Math.max(0.5, zoomLevel.value + delta), 3);
        }
    }

    onMounted(function() {
        initScopedCssData();

        // handle too many messages once every 10 seconds
        // delete all log entries above the maxMsgs amount, if maxMsgs > 0
        setInterval(() => {
            const $logValue = $log.value;
            if (!$logValue || !maxMsgs) {
                return;
            }

            const allLogContainers = $logValue.querySelectorAll('.log-container');
            const msgsAmount = allLogContainers.length;
            if (msgsAmount > maxMsgs) {
                const amountToDelete = msgsAmount - maxMsgs;
                for (let i = 0; i < amountToDelete; i++) {
                    const $node = allLogContainers[i];
                    if ($node && $node.parentNode) {
                        const logItem = logItems$.get($node);
                        if (logItem && logItem.isSaved) { // Check logItem.isSaved
                            // Skip removing saved queries
                            continue;
                        }
                        $node.parentNode.removeChild($node);
                    }
                }

                // Cleanup empty session groups
                const allGroups = $logValue.querySelectorAll('.session-group');
                for (const $group of allGroups) {
                    const $container = $group.querySelector('.session-container');
                    if ($container && $container.childNodes.length === 0) {
                        $group.parentNode.removeChild($group);
                        // Also remove from sessionGroups map
                        for (let [id, data] of sessionGroups.value.entries()) {
                            if (data.$group === $group) {
                                sessionGroups.value.delete(id);
                                break;
                            }
                        }
                    }
                }
            }
        }, 9999);
    });
</script>

<template>
    <div class="main-content">
        <div class="p-2 border-bottom" style="padding: 12px 40px 12px 40px !important;">
            <form class="d-flex align-items-center">
                <i class="bi fs-4 me-2 cursor-pointer" :class="showOnlySaved ? 'bi-star-fill text-warning' : 'bi-star'" @click="toggleShowOnlySaved" title="Show only saved queries"></i>
                <input class="form-control me-2" type="search" placeholder="Find a query..." aria-label="Search" v-model="searchInput" @search="search">
                <button class="btn btn-outline-success text-nowrap" @click.prevent="search">{{totalFound === -1 ? 'Search' : `Search (${currentFound > 0 ? currentFound : 0}/${totalFound})`}}</button>
            </form>
        </div>
        <div class="overflow-auto p-2 log pre-wrap" ref="$scrollContainer" @click="logClicked" @wheel="handleWheel">
            <div ref="$log" :style="{ zoom: zoomLevel }">
                <i>Start the proxy server to collect logs...</i>
            </div>
        </div>
    </div>

    <div class="modal fade" id="query-details" tabindex="-1" aria-labelledby="query-details-label" aria-hidden="true">
        <div class="modal-dialog modal-almost-fullscreen">
            <div class="modal-content">
                <div class="modal-header">
                    <div class="d-flex align-items-center">
                        <h1 class="modal-title fs-5 me-3" id="query-details-label">Query details</h1>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">Query</label>
                        <span class="modal-link small ms-2" @click="onModalBeautifyClicked">{{ modalBeautifyText }}</span>
                        <div v-html="$detailsQuery" class="pre-wrap"></div>
                    </div>
                    <div class="mb-3" v-if="$queryDetailsTimes">
                        <label class="form-label">Execution Details</label>
                        <div :class="{'text-danger fw-bold': isSlowQuery}">{{ $queryDetailsTimes }}</div>
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
                        <label class="form-label">Explain Query Error</label><div>{{ $explainQueryErr }}</div>
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
    .log-star,
    .log-date,
    .log-meta-short {
        font-size: 0.6em;
    }
    .log-star {
        float: left;
        line-height: 0.6em;
    }
    .log-date {
        line-height: 0.8em;
        float: left;
    }
    .log-meta-short {
        line-height: 0.8em;
        float: left;
    }
    .log-query {
        clear: both;
        line-height: 1.6em;
    }

    .log {
        width: 100%;
        height: calc(100vh - 60px);
        overflow: auto;
        word-wrap: break-word;
    }
    .pre-wrap {
        white-space: pre-wrap;
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
        color: var(--bs-primary);
        border-bottom: 1px dashed var(--bs-primary);
        cursor: pointer;
        user-select: none;
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

    .session-group {
        border-left: 3px solid var(--bs-primary);
        margin-top: 15px;
        margin-bottom: 15px;
        padding-left: 10px;
        background: rgba(var(--bs-primary-rgb), 0.05);
    }
    .session-header {
        font-weight: bold;
        color: var(--bs-primary);
        font-size: 0.9em;
        cursor: pointer;
        user-select: none;
        padding: 5px 0;
    }
    .session-header:hover {
        background: rgba(var(--bs-primary-rgb), 0.1);
    }
    .toggle-icon {
        transition: transform 100ms;
    }

    .session-container-wrapper {
        display: grid;
        grid-template-rows: 1fr;
        transition: grid-template-rows 100ms ease-in-out;
    }
    .session-group.collapsed .session-container-wrapper {
        grid-template-rows: 0fr;
    }
    .session-container {
        overflow: hidden;
    }
    .cursor-pointer {
        cursor: pointer;
    }
</style>
