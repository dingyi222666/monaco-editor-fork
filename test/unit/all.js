const requirejs = require('requirejs');
const jsdom = require('jsdom');
const glob = require('glob');
const path = require('path');
const fs = require('fs');

requirejs.config({
	baseUrl: '',
	paths: {
		'vs/fillers/monaco-editor-core': 'out/languages/amd-tsc/fillers/monaco-editor-core-amd',
		'vs/basic-languages': 'out/languages/amd-tsc/basic-languages',
		vs: './node_modules/monaco-editor-core/dev/vs'
	},
	nodeRequire: require
});

const tmp = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.AMD = true;
global.document = tmp.window.document;
global.navigator = tmp.window.navigator;
global.self = global;
global.document.queryCommandSupported = function () {
	return false;
};
global.UIEvent = tmp.window.UIEvent;

global.window = {
	location: {},
	navigator: tmp.window.navigator,
	document: {
		body: tmp.window.document.body,
		addEventListener: (...args) => tmp.window.document.addEventListener(...args)
	},
	matchMedia: function () {
		return {
			matches: false,
			addEventListener: function () {}
		};
	}
};

/**
 * @type {string[]}
 */
const excludeLanguages = ['freemarker2'];

/**
 * @type {Set<string>}
 */
const languages = new Set();
// add to global
global.callOnTest = (language, tests) => {
	const mainLanguage = typeof language === 'string' ? language : language[0];

	for (language of excludeLanguages) {
		if (mainLanguage.startsWith(language)) {
			return;
		}
	}

	if (languages.has(mainLanguage)) {
		return;
	}

	languages.add(mainLanguage);

	const outputDir = path.join(__dirname, '../..', 'language_packs', language);

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(
		path.join(outputDir, `${language}.test.json`),
		JSON.stringify(
			{
				tests,
				languages: typeof language === 'string' ? [language] : language
			},
			null,
			'  '
		)
	);

	// kotlin
	let buffer = `
import kotlin.test.Test

class MonarchFullTest {
	`;

	for (let language of languages) {
		buffer += `
	@Test
	fun \`tokenization${language}\`() {
		runTests("${language}")
	}\n\n`;
	}

	buffer += `}`;

	fs.writeFileSync(path.join(__dirname, '../..', 'language_packs', `MonarchFullTest.kt`), buffer);
};

requirejs(
	['test/unit/setup'],
	function () {
		glob(
			'out/languages/amd-tsc/basic-languages/*/*.test.js',
			{ cwd: path.join(__dirname, '../../') },
			function (err, files) {
				if (err) {
					console.log(err);
					return;
				}
				requirejs(
					files.map((f) => f.replace(/^out\/languages\/amd-tsc/, 'vs').replace(/\.js$/, '')),
					function () {
						run(); // We can launch the tests!
					},
					function (err) {
						console.log(err);
					}
				);
			}
		);

		glob(
			'out/languages/amd-tsc/basic-languages/*/*.js',
			{ cwd: path.join(__dirname, '../../') },
			function (err, files) {
				if (err) {
					console.log(err);
					return;
				}

				const mappedFiles = files
					.filter((f) => {
						const splits = f.split('.');
						const splits2 = f.split('/');
						const parentDirName = path.basename(path.dirname(f));

						return splits[1] === 'js' && splits2[splits2.length - 1] === `${parentDirName}.js`;
					})
					.map((f) => f.replace(/^out\/languages\/amd-tsc/, 'vs').replace(/\.js$/, ''));

				for (let languagePath of mappedFiles) {
					requirejs([languagePath], function (exports) {
						const splits = languagePath.split('/');
						const languageName = splits[splits.length - 1];
						const outputDir = path.join(__dirname, '../..', 'language_packs', languageName);

						const outputFileName = `${languageName}.json`;

						if (!fs.existsSync(outputDir)) {
							fs.mkdirSync(outputDir, { recursive: true });
						}
						if (exports.language == null) {
							console.log(`Language ${languageName} is too complex to be parsed, skip it`);
							return;
						}
						fs.writeFileSync(
							path.join(outputDir, outputFileName),
							JSON.stringify(replaceRegex(structuredClone(exports.language)), null, '  ')
						);
					});
				}
			}
		);
	},
	function (err) {
		console.log(err);
		process.exit(1);
	}
);

function replaceRegex(obj) {
	for (let key in obj) {
		if (obj[key] instanceof RegExp) {
			obj[key] = obj[key].source;
		} else if (typeof obj[key] === 'object') {
			obj[key] = replaceRegex(obj[key]);
		} else if (typeof obj[key] === 'array') {
			replaceRegex(obj[key]);
		}
	}
	return obj;
}
