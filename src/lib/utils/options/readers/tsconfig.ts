import * as Path from "path";
import * as FS from "fs";
import * as _ from "lodash";
import * as ts from "typescript";

import {Component, Option} from "../../component";
import {OptionsComponent, DiscoverEvent} from "../options";
import {ParameterType, ParameterHint} from "../declaration";
import {TypeScriptSource} from "../sources/typescript";


@Component({name:"options:tsconfig"})
export class TSConfigReader extends OptionsComponent
{
    @Option({
        name: TSConfigReader.OPTIONS_KEY,
        help: 'Specify a js option file that should be loaded. If not specified TypeDoc will look for \'typedoc.js\' in the current directory.',
        type: ParameterType.String,
        hint: ParameterHint.File
    })
    options:string;

    /**
     * The name of the parameter that specifies the tsconfig file.
     */
    private static OPTIONS_KEY:string = 'tsconfig';


    private readConfigFile(event:DiscoverEvent, fileName:string) {
        if (!FS.existsSync(fileName)) {
            event.addError('The tsconfig file %s does not exist.', fileName);
            return;
        }
        let data = ts.readConfigFile(fileName, ts.sys.readFile).config;
        if (data === undefined) {
            event.addError('The tsconfig file %s does not contain valid JSON.', fileName);
            return;
        }
        if (!_.isPlainObject(data)) {
            event.addError('The tsconfig file %s does not contain a JSON object.', fileName);
            return;
        }
        if (data.extends) {
            const parent = this.readConfigFile(event, Path.resolve(Path.dirname(fileName), `${data.extends}.json`));
            if (!parent) { return; }
            data.compilerOptions = _.extend(parent.compilerOptions, data.compilerOptions);
            data = _.extend(parent, data);
            delete data.extends;
        }
        return data;
    }


    initialize() {
        this.listenTo(this.owner, DiscoverEvent.DISCOVER, this.onDiscover, -100);
    }


    onDiscover(event:DiscoverEvent) {
        if (TSConfigReader.OPTIONS_KEY in event.data) {
            this.load(event, Path.resolve(event.data[TSConfigReader.OPTIONS_KEY]));
        } else if (this.application.isCLI) {
            let file:string = ts.findConfigFile(".", ts.sys.fileExists);
            // If file is undefined, we found no file to load.
            if (file) {
                this.load(event, file);
            }
        }
    }


    /**
     * Load the specified tsconfig file.
     *
     * @param event  The event that triggered the loading. Used to store error messages.
     * @param fileName  The absolute path and file name of the tsconfig file.
     */
    load(event:DiscoverEvent, fileName:string) {
        let data = this.readConfigFile(event, fileName);

        if (!data) { return; }

        data = ts.parseJsonConfigFileContent(
            data,
            ts.sys,
            Path.resolve(Path.dirname(fileName)),
            {},
            Path.resolve(fileName));

        event.inputFiles = data.fileNames;
        const ignored = TypeScriptSource.IGNORED;
        let compilerOptions = _.clone(data.raw.compilerOptions);
        for (const key of ignored) {
            delete compilerOptions[key];
        }

        _.defaults(event.data, data.raw.typedocOptions, compilerOptions);
    }
}
