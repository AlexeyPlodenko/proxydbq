<script setup>
    import ModeSwitcher from "./ModeSwitcher.vue";
    import {onMounted, ref} from "vue";
    import {d} from "../lib/helpers.js";
    import Sidebar from "./Sidebar.vue";
    import {useConnectionsStore} from "../stores.js";
    import {storeToRefs} from "pinia";

    const connectionsStore = useConnectionsStore();
    const {
        mysqlServerIp,
        mysqlServerPort,
        mysqlProxyLocalhost,
        mysqlProxyPort,
        mysqlServerLogin,
        mysqlServerPassword,
        mysqlServerDatabase
    } = storeToRefs(connectionsStore);

    const isProxyRunning = ref(false);

    // @TODO disable the START button while the proxy is starting, to keep the UI and behavior consistent

    function toggleServerStatus() {
        if (isProxyRunning.value) {
            window.electronAPI.stopProxyServers();
        } else {
            window.electronAPI.startProxyServers(
                mysqlServerIp.value,
                mysqlServerPort.value,
                mysqlProxyLocalhost.value ? '127.0.0.1' : '0.0.0.0',
                mysqlProxyPort.value
            );
        }
        isProxyRunning.value = !isProxyRunning.value;
    }

    onMounted(function() {
        if (window.env.isDevelopment()) {
            toggleServerStatus();
        }
    });
</script>

<template>
    <sidebar>
        <template v-slot:content>
                <a href="https://github.com/alexeyplodenko/proxydbq" target="_blank" class="d-flex align-items-center pb-3 mb-3 link-body-emphasis text-decoration-none border-bottom">
                    <svg class="bi pe-none me-2" width="30" height="24" aria-hidden="true"><!-- @TODO icon --></svg>
                    <span class="fs-5 fw-semibold">Proxy DBQ</span>
                    <sup class="ms-1">(v0.0.1)</sup>
                </a>
                <ul class="list-unstyled ps-0 mb-auto">
                <li class="mb-1">
                    <button class="btn btn-toggle d-inline-flex align-items-center rounded border-0 collapsed" data-bs-toggle="collapse" data-bs-target="#mysql-collapse" aria-expanded="true">
                        MySQL
                    </button>
                    <div class="collapse show" style="margin-left: 33px;" id="mysql-collapse">
                        <div class="mb-3">
                            <label for="mysql-server-ip" class="form-label">Target DB server IP (host) *</label>
                            <i class="bi bi-info-circle small ms-1 text-primary" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="The IP address or hostname of the target MySQL DB server."></i>
                            <input type="text" class="form-control" id="mysql-server-ip" v-model="mysqlServerIp">
                        </div>
                        <div class="mb-3">
                            <label for="mysql-server-port" class="form-label">Target DB server port *</label>
                            <i class="bi bi-info-circle small ms-1 text-primary" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="The port of the target MySQL DB server (default 3306)."></i>
                            <input type="text" class="form-control" id="mysql-server-port" v-model="mysqlServerPort">
                        </div>
                        <div class="mb-3">
                            <label for="mysql-proxy-port" class="form-label">Local proxy port *</label>
                            <i class="bi bi-info-circle small ms-1 text-primary" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="A local port to start the proxy server on. Your code or MySQL client should point to that."></i>
                            <input type="text" class="form-control" id="mysql-proxy-port" v-model="mysqlProxyPort">
                        </div>
                        <div class="mb-3 form-check">
                            <input type="checkbox" class="form-check-input" id="mysql-proxy-localhost" v-model="mysqlProxyLocalhost">
                            <label class="form-check-label" for="mysql-proxy-localhost">Listen on localhost only</label>
                            <i class="bi bi-info-circle small ms-1 text-primary" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Should the proxy server listen on localhost (127.0.0.1) or all network interfaces? Should the proxy server be available externally?"></i>
                        </div>
    <!--                    <div class="mb-3">-->
    <!--                        <label for="local-proxy-ip" class="form-label">Local proxy IP</label>-->
    <!--                        <input type="text" class="form-control" id="local-proxy-ip" disabled value="127.0.0.1">-->
    <!--                        <div class="form-text">A local port to start the proxy server on. Your code or MySQL client should point to that.</div>-->
    <!--                    </div>-->
                        <button class="btn btn-outline-primary" @click="toggleServerStatus">
                            <span class="menu_status" :style="{ background: isProxyRunning ? 'green' : 'red' }"></span>
                            {{ isProxyRunning ? 'Stop Proxy Server' : 'Start Proxy Server' }}
                        </button>

                        <div class="mt-3">
                            <label for="mysql-proxy-login" class="form-label">Login</label>
                            <input type="text" class="form-control" id="mysql-proxy-login" v-model="mysqlServerLogin">
                        </div>

                        <div class="mt-3">
                            <label for="mysql-proxy-password" class="form-label">Password</label>
                            <input type="text" class="form-control" id="mysql-proxy-password" v-model="mysqlServerPassword">
                        </div>

                        <div class="mt-3">
                            <label for="mysql-proxy-database" class="form-label">Database</label>
                            <input type="text" class="form-control" id="mysql-proxy-database" v-model="mysqlServerDatabase">
                        </div>

    <!--                    <input type="text" v-model="mysqlIp" placeholder="IP (host)">-->
    <!--                    <input type="text" v-model="mysqlProxyPort" placeholder="Proxy port">-->
    <!--                    <input type="text" v-model="mysqlServerPort" placeholder="Server port">-->
    <!--                    <button @click="toggleServerStatus">-->
    <!--                        <span class="menu_status" :style="{ background: isProxyRunning ? 'green' : 'red' }"></span>-->
    <!--                        {{ isProxyRunning ? 'Stop Proxy Server' : 'Start Proxy Server' }}-->
    <!--                    </button>-->

    <!--                    <ul class="btn-toggle-nav list-unstyled fw-normal pb-1 small">-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Overview</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Updates</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Reports</a>-->
    <!--                        </li>-->
    <!--                    </ul>-->
                    </div>
                </li>
    <!--            <li class="mb-1">-->
    <!--                <button class="btn btn-toggle d-inline-flex align-items-center rounded border-0 collapsed" data-bs-toggle="collapse" data-bs-target="#dashboard-collapse" aria-expanded="false">-->
    <!--                    Dashboard-->
    <!--                </button>-->
    <!--                <div class="collapse" id="dashboard-collapse">-->
    <!--                    <ul class="btn-toggle-nav list-unstyled fw-normal pb-1 small">-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Overview</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Weekly</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Monthly</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Annually</a>-->
    <!--                        </li>-->
    <!--                    </ul>-->
    <!--                </div>-->
    <!--            </li>-->
    <!--            <li class="mb-1">-->
    <!--                <button class="btn btn-toggle d-inline-flex align-items-center rounded border-0 collapsed" data-bs-toggle="collapse" data-bs-target="#orders-collapse" aria-expanded="false">-->
    <!--                    Orders-->
    <!--                </button>-->
    <!--                <div class="collapse" id="orders-collapse">-->
    <!--                    <ul class="btn-toggle-nav list-unstyled fw-normal pb-1 small">-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">New</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Processed</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Shipped</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Returned</a>-->
    <!--                        </li>-->
    <!--                    </ul>-->
    <!--                </div>-->
    <!--            </li>-->
    <!--            <li class="border-top my-3"/>-->
    <!--            <li class="mb-1">-->
    <!--                <button class="btn btn-toggle d-inline-flex align-items-center rounded border-0 collapsed" data-bs-toggle="collapse" data-bs-target="#account-collapse" aria-expanded="false">-->
    <!--                    Account-->
    <!--                </button>-->
    <!--                <div class="collapse" id="account-collapse">-->
    <!--                    <ul class="btn-toggle-nav list-unstyled fw-normal pb-1 small">-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">New...</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Profile</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Settings</a>-->
    <!--                        </li>-->
    <!--                        <li>-->
    <!--                            <a href="#" class="link-body-emphasis d-inline-flex text-decoration-none rounded">Sign out</a>-->
    <!--                        </li>-->
    <!--                    </ul>-->
    <!--                </div>-->
    <!--            </li>-->
            </ul>
            <hr>
            <mode-switcher></mode-switcher>
    <!--        <div class="dropdown">-->
    <!--            <a href="#" class="d-flex align-items-center link-dark text-decoration-none dropdown-toggle" id="dropdownUser2" data-bs-toggle="dropdown" aria-expanded="false">-->
    <!--                <img src="https://github.com/mdo.png" alt="" width="32" height="32" class="rounded-circle me-2">-->
    <!--                <strong>mdo</strong>-->
    <!--            </a>-->
    <!--            <ul class="dropdown-menu text-small shadow" aria-labelledby="dropdownUser2" style="">-->
    <!--                <li><a class="dropdown-item" href="#">New project...</a></li>-->
    <!--                <li><a class="dropdown-item" href="#">Settings</a></li>-->
    <!--                <li><a class="dropdown-item" href="#">Profile</a></li>-->
    <!--                <li><hr class="dropdown-divider"></li>-->
    <!--                <li><a class="dropdown-item" href="#">Sign out</a></li>-->
    <!--            </ul>-->
    <!--        </div>-->
        </template>
    </sidebar>
</template>

<style scoped>
    .menu_status {
        width: 5px;
        height: 5px;
        border-radius: 5px;
        margin-right: 5px;
        margin-bottom: 2px;
        display: inline-block;
    }
</style>
