module.exports = {
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'alexeyplodenko',
                    name: 'proxydbq'
                },
                prerelease: false,
                draft: true
            }
        }
    ]
}
