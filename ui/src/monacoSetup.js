// Monaco (the editor inside VS Code), bundled with the site instead of loaded
// from a CDN, so the workspace works on any network. Only the workspace page
// imports this file, so other pages stay small.
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new JsonWorker();
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker();
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker();
    if (['typescript', 'javascript'].includes(label)) return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });

const LANGUAGES = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  py: 'python',
};

export const languageOf = (path) => LANGUAGES[path.split('.').pop().toLowerCase()] ?? 'plaintext';
