import { Runtime, Library } from "@observablehq/runtime";
import { FileAttachments } from "@observablehq/stdlib";
import { Cell } from "./cell";
import { observablehq as ohq } from "./types";
import { Writer } from "./writer";

export class Notebook {

    protected _runtime: ohq.Runtime;
    protected _main: ohq.Module;
    protected _cells: Set<Cell> = new Set<Cell>();

    constructor(notebook?: ohq.Notebook, plugins: object = {}) {
        const files = {};
        notebook?.files?.forEach(f => files[f.name] = f.url);

        const library = new Library();
        library.FileAttachment = function () {
            return FileAttachments(name => {
                return files[name];
            });
        };

        const domDownload = library.DOM.download;
        library.DOM.download = function (blob, file) {
            return domDownload(blob, files[file]);
        };

        this._runtime = new Runtime({ ...library, ...plugins });
        this._main = this._runtime.module();
    }

    dispose() {
        this._runtime.dispose();
        this._cells.clear();
    }

    createCell(observer?: ohq.InspectorFactory): Cell {
        const newCell = new Cell(this, observer);
        this._cells.add(newCell);
        return newCell;
    }

    disposeCell(cell: Cell) {
        cell.reset();
        this._cells.delete(cell);
    }

    compile(writer: Writer) {
        this._cells.forEach(cell => {
            try {
                cell.compile(writer);
            } catch (e: any) {
                writer.error(e?.message);
            }
        });
    }

    //  ObservableHQ  ---
    main(): ohq.Module {
        return this._main;
    }

    createModule(define): ohq.Module {
        return this._runtime.module(define);
    }

    createVariable(inspector?: ohq.Inspector, name?: string, inputs?: string[], definition?: any): ohq.Variable {
        const retVal = this._main.variable(inspector);
        if (arguments.length > 1) {
            try {
                retVal.define(name, inputs, definition);
            } catch (e: any) {
                console.error(e?.message);
            }
        }
        return retVal;
    }

    importVariable(name: string, alias: string | undefined, otherModule: ohq.Module): ohq.Variable {
        return this._main.import(name, alias, otherModule);
    }
}