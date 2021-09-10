import { equal, ok } from "assert";
import { join, relative } from "path";
import { Logger, LogLevel } from "..";
import { validateExports } from "../lib/validation/exports";
import { getConverter2App, getConverter2Program } from "./programs";

function expectWarning(
    typeName: string,
    file: string,
    referencingNames: string[] | string
) {
    const refs = Array.isArray(referencingNames)
        ? referencingNames
        : [referencingNames];

    const app = getConverter2App();
    const program = getConverter2Program();
    const sourceFile = program.getSourceFile(
        join(__dirname, "converter2/validation", file)
    );

    ok(sourceFile, "Specified source file does not exist.");

    const project = app.converter.convert([
        {
            displayName: "validation",
            program,
            sourceFile,
        },
    ]);

    let sawWarning = false;
    const regex =
        /(.*?), defined at (.*?):\d+, is referenced by (.*?) but not included in the documentation\./;

    class LoggerCheck extends Logger {
        override log(message: string, level: LogLevel) {
            const match = message.match(regex);
            if (level === LogLevel.Warn && match) {
                sawWarning = true;
                equal(match[1], typeName, "Missing type name is different.");
                equal(
                    match[2],
                    relative(
                        process.cwd(),
                        join(__dirname, "converter2/validation", file)
                    ),
                    "Referencing file is different."
                );
                ok(
                    refs.includes(match[3]),
                    `Referencing name is different, expected ${
                        match[3]
                    } to be: ${refs.join(", ")}`
                );
            }
        }
    }

    validateExports(project, new LoggerCheck(), []);
    ok(sawWarning, `Expected warning message for ${typeName} to be reported.`);
}

describe("validateExports", () => {
    it("Should warn if a variable type is missing", () => {
        expectWarning("Foo", "variable.ts", "foo");
    });

    it("Should warn if a type parameter clause is missing", () => {
        expectWarning("Foo", "typeParameter.ts", [
            "Bar.T",
            "Bar.constructor.new Bar.T",
        ]);
    });

    it("Should warn if an index signature type is missing", () => {
        expectWarning("Bar", "indexSignature.ts", "Foo.__index");
    });

    it("Should warn within object types", () => {
        expectWarning("Foo", "object.ts", "x.__type.foo");
    });

    it("Should warn if a get signature type is missing", () => {
        expectWarning("Bar", "getSignature.ts", "Foo.foo.foo");
    });

    it("Should warn if a set signature type is missing", () => {
        expectWarning("Bar", "setSignature.ts", "Foo.foo.foo._value");
    });

    it("Should warn if an implemented type is missing", () => {
        expectWarning("Bar", "implemented.ts", "Foo");
    });

    it("Should warn if a parameter type is missing", () => {
        expectWarning("Bar", "parameter.ts", "Foo.Foo.x");
    });

    it("Should warn if a return type is missing", () => {
        expectWarning("Bar", "return.ts", "foo.foo");
    });

    it("Should warn if intentionallyNotExported contains unused values", () => {
        const app = getConverter2App();
        const program = getConverter2Program();
        const sourceFile = program.getSourceFile(
            join(__dirname, "converter2/validation/variable.ts")
        );

        ok(sourceFile, "Specified source file does not exist.");

        const project = app.converter.convert([
            {
                displayName: "validation",
                program,
                sourceFile,
            },
        ]);

        let sawWarning = false;
        class LoggerCheck extends Logger {
            override log(message: string, level: LogLevel) {
                if (
                    level == LogLevel.Warn &&
                    message.includes("intentionally not exported")
                ) {
                    sawWarning = true;
                    ok(
                        message.includes("notDefined"),
                        "Should have included a warning about notDefined"
                    );
                    ok(
                        !message.includes("Foo"),
                        "Should not include a warn about Foo"
                    );
                }
            }
        }

        validateExports(project, new LoggerCheck(), ["notDefined", "Foo"]);
        ok(sawWarning, "Never saw warning.");
    });
});