import {EditorState, Compartment} from '@codemirror/state';
import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput} from '@codemirror/language';
import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete';
import {searchKeymap, highlightSelectionMatches} from '@codemirror/search';
import {javascript} from '@codemirror/lang-javascript';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {json} from '@codemirror/lang-json';
import {oneDark} from '@codemirror/theme-one-dark';

export function createEditor(parent, onChange) {
  const theme = new Compartment(), editable = new Compartment();
  let currentKey = '', applying = false;
  const states = new Map();
  const extensions = language => [lineNumbers(),foldGutter(),highlightActiveLine(),highlightActiveLineGutter(),drawSelection(),history(),indentOnInput(),bracketMatching(),closeBrackets(),autocompletion(),highlightSelectionMatches(),syntaxHighlighting(defaultHighlightStyle), language, keymap.of([...closeBracketsKeymap,...defaultKeymap,...historyKeymap,...searchKeymap,...completionKeymap,indentWithTab]), theme.of(document.documentElement.dataset.theme==='dark'?oneDark:[]),editable.of(EditorView.editable.of(true)),EditorView.updateListener.of(u=>{if(u.docChanged&&!applying)onChange(u.state.doc.toString())})];
  const view = new EditorView({parent,state:EditorState.create({extensions:extensions([])})});
  const languageFor = path => /\.[jt]sx?$/.test(path)?javascript({jsx:/x$/.test(path),typescript:/\.tsx?$/.test(path)}):/\.html?$/.test(path)?html():/\.css$/.test(path)?css():/\.json$/.test(path)?json():[];
  return {
    show(project,path,content) {
      const key=project+':'+path;
      if(currentKey&&currentKey!==key)states.set(currentKey,view.state);
      applying=true;
      if(currentKey!==key) {
        const old=states.get(key);
        view.setState(old||EditorState.create({doc:content||'',extensions:extensions(languageFor(path||''))})); currentKey=key;
      }
      if(view.state.doc.toString()!==(content||''))view.dispatch({changes:{from:0,to:view.state.doc.length,insert:content||''}});
      view.dispatch({effects:[theme.reconfigure(document.documentElement.dataset.theme==='dark'?oneDark:[]),editable.reconfigure(EditorView.editable.of(Boolean(path)))]});
      applying=false;
      while(states.size>40)states.delete(states.keys().next().value);
    },
    theme(dark){view.dispatch({effects:theme.reconfigure(dark?oneDark:[])})},
    focus(){view.focus()}
  };
}
