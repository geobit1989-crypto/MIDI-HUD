import test from "node:test";
import assert from "node:assert/strict";
import {parseLeadSheetText,formatLeadSheetText} from "../editor/lead-sheet-text.mjs";
import {scanNotation,convertSheet} from "../editor/chord-notation.mjs";
test("cuatro posiciones explícitas y repetición equivalente",()=>{const source="A - Intro\n| F . . C | % | F Am Bb C | / |";const p=parseLeadSheetText(source);assert.deepEqual(p.errors,[]);assert.deepEqual(p.sections[0].bars,[["F","","","C"],["/","","",""],["F","Am","Bb","C"],["/","","",""]]);assert.deepEqual(scanNotation(source).invalid,[]);assert.match(convertSheet(source,"latino"),/Fa \. \. Do \| %/);assert.deepEqual(parseLeadSheetText(formatLeadSheetText({sections:p.sections})).sections,p.sections);});
