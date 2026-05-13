import {VueLoaderPlugin} from 'vue-loader';
import rules from './webpack.renderer.rules.mjs';
import webpack from 'webpack';

const isDev = process.env.NODE_ENV === 'development';

rules.push({
    test: /\.css$/,
    use: [{loader: 'style-loader'}, {loader: 'css-loader'}],
});

export default {
    // mode: 'development',
    // devtool: 'eval-source-map',
    // devtool: isDev ? 'eval-source-map' : 'source-map',
    module: {
        rules,
    },
    plugins: [
        new VueLoaderPlugin(),
        new webpack.DefinePlugin({
            __VUE_OPTIONS_API__: JSON.stringify(true),
            __VUE_PROD_DEVTOOLS__: JSON.stringify(isDev),
            __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
        }),
    ]
};
