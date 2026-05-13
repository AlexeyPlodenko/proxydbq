import {VueLoaderPlugin} from 'vue-loader';
import rules from './webpack.renderer.rules.js';

const isDev = process.env.NODE_ENV === 'development';

rules.push({
    test: /\.css$/,
    use: [{loader: 'style-loader'}, {loader: 'css-loader'}],
});

export default {
    mode: 'development',
    devtool: 'eval-source-map',
    // devtool: isDev ? 'eval-source-map' : 'source-map',
    module: {
        rules,
    },
    plugins: [
        new VueLoaderPlugin(),
    ]
};
