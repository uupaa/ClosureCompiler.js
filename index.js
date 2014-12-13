#!/usr/bin/env node

(function(global) {

var USAGE = _multiline(function() {/*
    Usage:
        node ClosureCompiler.js [@label ...]
                                [--help]
                                [--verbose]
                                [--nowrap]
                                [--nocompile]
                                [--header file]
                                [--footer file]
                                [--es5in]
                                [--es6in]
                                [--es5out]
                                [--es6out]
                                [--keep]
                                [--simple]
                                [--strict]
                                [--pretty]
                                [--option "compile option"]
                                [--output file]
                                [--source file]
                                [--label @label]
                                [--package]

    See:
        https://github.com/uupaa/ClosureCompiler.js/wiki/ClosureCompiler
*/});

var ERR  = "\u001b[31m";
var WARN = "\u001b[33m";
var INFO = "\u001b[32m";
var CLR  = "\u001b[0m";
var OUTPUT_FILE = "./.Minify.output.js";
var TMP_FILE    = "./.Minify.tmp.js";

var fs      = require("fs");
var cp      = require("child_process");
var path    = require("path");
var argv    = process.argv.slice(2);
var options = _parseCommandLineOptions({
        help:       false,          // Boolean      - true is show help.
        keep:       false,          // Boolean      - keep tmp file.
        label:      ["dev", "debug", "assert"], // LabelStringArray
        nowrap:     false,          // Boolean      - false -> wrap WebModule idiom.
        header:     "",             // PathString   - header file.
        footer:     "",             // PathString   - footer file.
        es5in:      false,          // Boolean      - input ES5 code.
        es6in:      false,          // Boolean      - input ES6 code.
        es5out:     false,          // Boolean      - output ES5 code.
        es6out:     false,          // Boolean      - output ES6 code.
        strict:     false,          // Boolean      - true -> add 'use strict'.
        pretty:     false,          // Boolean      - true -> pretty print.
        source:     [],             // PathStringArray - ["source-file", ...]
        output:     "",             // PathString   - "output-file-name"
        option:     [],             // OptionStringArray - ["language_in ECMASCRIPT5_STRICT", ...]
        compile:    true,           // Boolean      - true -> compile.
        verbose:    false,          // Boolean      - true -> verbose mode.
        workDir:    "",             // PathString   - work dir.
        pkg:        false,          // Boolean      - load package. --package
        advanced:   true            // Boolean      - true -> ADVANCED_OPTIMIZATIONS MODE.
    });

if (options.pkg) { // --package option
    var pkg = JSON.parse(fs.readFileSync("./package.json"));
    options.source = pkg.webmodule.source;
    options.output = pkg.webmodule.output;
}

// get work dir
if (!options.workDir) {
    if (options.output) {
        if (options.output.indexOf("/") <= 0) {
            options.workDir = "";
        } else {
            // "release/Module.min.js" -> "release/";
            options.workDir = (options.output.split("/").slice(0, -1)).join("/") + "/";
        }
    }
}

if (options.help) {
    console.log(WARN + USAGE + CLR);
    return;
}
if (!options.source.length) {
    console.log(ERR + "Input source are empty." + CLR);
    return;
}
if (!options.output.length) {
    console.log(ERR + "Output file is empty." + CLR);
    return;
}
if (!options.workDir.length) {
    console.log(ERR + "Invalid working directory." + CLR);
    return;
}

if (!_isFileExists(options.source)) {
    console.log(WARN + USAGE + CLR);
    return;
}

Minify(options.source, options, function(err, js) {
    fs.writeFileSync(options.output, js);
});

function _isFileExists(fileList) { // @arg Array
                                   // @ret Boolean
    return fileList.every(function(file) {
        if (!fs.existsSync(file)) {
            console.log(ERR + "File not found: " + file + CLR);
            return false;
        }
        return true;
    });
}

function _parseCommandLineOptions(options) {
    for (var i = 0, iz = argv.length; i < iz; ++i) {
        switch (argv[i]) {
        case "-h":
        case "--help":      options.help = true; break;
        case "-v":
        case "--verbose":   options.verbose = true; break;
        case "--nowrap":    options.nowrap = true; break;
        case "--nocompile": options.compile = false; break;
        case "--header":    options.header = fs.readFileSync(argv[++i], "utf8"); break;
        case "--footer":    options.footer = fs.readFileSync(argv[++i], "utf8"); break;
        case "--es5in":     options.es5in = true; break;
        case "--es6in":     options.es6in = true; break;
        case "--es5out":    options.es5out = true; break;
        case "--es6out":    options.es6out = true; break;
        case "--strict":    options.strict = true; break;
        case "--pretty":    options.pretty = true; break;
        case "--keep":      options.keep = true; break;
        case "--simple":    options.advanced = false; break;
        case "--output":    options.output = argv[++i]; break;
        case "--option":    _pushif(options.option, argv[++i]); break;
        case "--label":     _pushif(options.label, argv[++i].replace(/^@/, "")); break;
        case "--source":    _pushif(options.source, argv[++i]); break;
        case "--package":   options.pkg = true; break;
        default:
            if ( /^@/.test(argv[i]) ) { // @label
                _pushif(options.label, argv[i].replace(/^@/, ""));
            } else {
                throw new Error("Unknown option: " + argv[i]);
            }
        }
    }
    return options;
}

function _pushif(source, value) {
    if (source.indexOf(value) < 0) { // avoid duplicate
        source.push(value);
    }
}

function _multiline(fn) { // @arg Function
                          // @ret String
    return (fn + "").split("\n").slice(1, -1).join("\n");
}

// ---------------------------------------------------------
function Minify(sources, options, fn) {
    var optionsString = _makeClouserCompilerOptions(options);

    if (options.compile) {
        _offlineMinification(sources, options, optionsString, fn);
    } else {
        var js = (options.header || "") + _concatFiles(sources) + (options.footer || "");

        if (options.label && options.label.length) {
            js = Minify_preprocess( js, options.label );
        }
        if (fn) {
            fn(null, js);
        }
    }
}

// --- implements ------------------------------------------
function _makeClouserCompilerOptions(options) { // @arg Object - { keep, nowrap, ... }. see Minify()
                                                // @ret String - "--option value ..."
    var result = [];

  //result["transform_amd_modules"] = "";
  //result["create_source_map"] = "source.map";

    if (options.advanced) {
        result.push("--compilation_level ADVANCED_OPTIMIZATIONS");
    } else {
        result.push("--compilation_level SIMPLE_OPTIMIZATIONS");
    }
    if (!options.nowrap) { // wrap WebModule idiom
        result.push("--output_wrapper '(function(global){\n%output%\n})((this||0).self||global);'");
    }

    if (options.strict) {
        if (options.es5in) {
            result.push("--language_in ECMASCRIPT5_STRICT");
        } else if (options.es6in) {
            result.push("--language_in ECMASCRIPT6_STRICT");
        } else { // back compat
            result.push("--language_in ECMASCRIPT5_STRICT");
        }
        if (options.es5out) {
            result.push("--language_out ECMASCRIPT5_STRICT");
        } else if (options.es6out) {
            result.push("--language_out ECMASCRIPT6_STRICT");
        }
    } else {
        if (options.es5in) {
            result.push("--language_in ECMASCRIPT5");
        } else if (options.es6in) {
            result.push("--language_in ECMASCRIPT6");
        } else { // back compat
            result.push("--language_in ECMASCRIPT5");
        }
        if (options.es5out) {
            result.push("--language_out ECMASCRIPT5");
        } else if (options.es6out) {
            result.push("--language_out ECMASCRIPT6");
        }
    }
    if (options.pretty) {
        result.push("--formatting pretty_print");
    }
    if (options.option.length) {
        result.push("--" + optionsObject.option.join(" --"));
    }
    return result.join(" ");
}

function _offlineMinification(sources,       // @arg StringArray - JavaScript SourceCode file path. [path, ...]
                              options,       // @arg Object - { keep, nowrap, ... }. see Minify()
                              optionsString, // @arg String
                              callback) {    // @arg Function = null - callback(err:Error, result:String)

    var js = (options.header || "") + _concatFiles(sources) + (options.footer || "");

    if (options.label && options.label.length) {
        js = Minify_preprocess(js, options.label);
    }
    fs.writeFileSync(options.workDir + TMP_FILE, js);

    if (options.verbose) {
        console.log(INFO + "\nCompile options: \n  " + optionsString.replace(/\n/g, "") + CLR);
    }

    var jar = path.join(__dirname, 'vendor/compiler.jar');

    var command = "java -jar "         + jar +
                  " --js_output_file " + options.workDir + OUTPUT_FILE +
                  " --js "             + options.workDir + TMP_FILE +
                  " "                  + optionsString;
    cp.exec(command, function(err, stdout, stderr) {
        if (err || stderr) {
            console.log(stderr);
            if (callback) {
                callback(new Error(stderr), "");
            }
        } else {
            var minifiedCode = fs.readFileSync(options.workDir + OUTPUT_FILE, "utf8");

            fs.unlinkSync(options.workDir + OUTPUT_FILE);
            if (!options.keep) {
                fs.unlinkSync(options.workDir + TMP_FILE);
            }
            if (callback) {
                callback(null, minifiedCode);
            }
        }
    });
}

function Minify_preprocess(js,       // @arg String - JavaScript expression string.
                           labels) { // @arg StringArray - strip labels. ["label", ...]
    // normalize line feed.
    js = js.replace(/(\r\n|\r|\n)/mg, "\n");

    // trim code block.
    js = _trimCodeBlock(js, labels);

    return js;
}

function _trimCodeBlock(js,       // @arg String - JavaScript expression string.
                        labels) { // @arg StringArray - [label, ...]
                                  // @ret String
    return labels.reduce(function(js, label) {
        // trim:
        //
        // {@label ... }@label
        //
        var line  = RegExp("\\{@" + label + "\\b(?:[^\\n]*)\\}@" +
                                    label + "\\b", "g");

        // trim:
        //
        // {@label
        //   ...
        // }@label
        //
        var lines = RegExp("\\{@" + label + "\\b(?:[^\\n]*)\n(?:[\\S\\s]*?)?\\}@" +
                                    label + "\\b", "g");

        return js.replace(line, " ").replace(lines, " ");
    }, js);
}

function _concatFiles(sources) { // @arg FilePathArray
                                 // @ret String
    return sources.map(function(path) {
        if (fs.existsSync(path)) {
            return fs.readFileSync(path, "utf8");
        }
        console.log(path + " is not exists");
        return "";
    }).join("");
}

})((this || 0).self || global);

