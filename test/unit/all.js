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
const excludeLanguages = ['freemarker2', 'aes', 'sol'];

const renameLanguages = {
	coffee: 'coffeescript',
	proto: 'protobuf'
};

/**
 * @type {Set<string>}
 */
const languages = new Set();
// add to global
global.callOnTest = (language, tests) => {
	let mainLanguage = typeof language === 'string' ? language : language[0];

	for (const language of excludeLanguages) {
		if (mainLanguage.startsWith(language)) {
			return;
		}
	}

	if (languages.has(mainLanguage)) {
		return;
	}

	mainLanguage = renameLanguages[mainLanguage] ?? mainLanguage;

	const outputDir = path.join(__dirname, '../..', 'language_packs', mainLanguage);

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(
		path.join(outputDir, `${mainLanguage}.test.json`),
		JSON.stringify(
			{
				tests,
				languages: typeof language === 'string' ? [language] : language
			},
			null,
			'  '
		)
	);

	languages.add(mainLanguage);

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
						let languageName = splits[splits.length - 1];
						languageName = renameLanguages[languageName] ?? languageName;
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
		const value = obj[key];
		if (value instanceof RegExp) {
			obj[key] = value.source;
		} else if (typeof value === 'object') {
			obj[key] = replaceRegex(value);
		} else if (typeof value === 'array') {
			replaceRegex(obj[key]);
		}
	}
	return obj;
}
