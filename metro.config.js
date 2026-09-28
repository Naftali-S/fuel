// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundled SQLite reference data (assets/data/cnf.db).
config.resolver.assetExts.push('db');

module.exports = config;
