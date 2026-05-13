import rules from './webpack.main.rules.mjs';

const isDev = process.env.NODE_ENV === 'development';

export default {
    entry: './src/main.js',
    // devtool: isDev ? 'eval-source-map' : 'source-map',
    module: {
        rules,
    },
    plugins: [],
    output: {
        filename: 'index.js',
    },
    node: {
        __dirname: true,
        __filename: true,
    },
};
