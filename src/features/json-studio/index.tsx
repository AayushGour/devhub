import { useJsonStudio } from './hooks/useJsonStudio'
import JsonToolbar from './components/JsonToolbar'
import FormatMode from './components/modes/FormatMode'
import TreeMode from './components/modes/TreeMode'
import GraphMode from './components/modes/GraphMode'
import DiffMode from './components/modes/DiffMode'
import JsonPathMode from './components/modes/JsonPathMode'
import SchemaMode from './components/modes/SchemaMode'
import TypesMode from './components/modes/TypesMode'

export default function JsonStudioPage() {
  const state = useJsonStudio()

  return (
    <div className="studio-root">
      <JsonToolbar
        title={state.title}
        setTitle={state.setTitle}
        mode={state.mode}
        setMode={state.setMode}
      />

      <div className="flex flex-1 min-h-0">
        {state.mode === 'format' && (
          <FormatMode input={state.input} setInput={state.setInput} />
        )}
        {state.mode === 'tree' && (
          <TreeMode input={state.input} setInput={state.setInput} />
        )}
        {state.mode === 'graph' && (
          <GraphMode input={state.input} />
        )}
        {state.mode === 'diff' && (
          <DiffMode
            diffLeft={state.diffLeft}
            setDiffLeft={state.setDiffLeft}
            diffRight={state.diffRight}
            setDiffRight={state.setDiffRight}
          />
        )}
        {state.mode === 'jsonpath' && (
          <JsonPathMode
            input={state.input}
            setInput={state.setInput}
            jsonPathQuery={state.jsonPathQuery}
            setJsonPathQuery={state.setJsonPathQuery}
          />
        )}
        {state.mode === 'schema' && (
          <SchemaMode input={state.input} setInput={state.setInput} />
        )}
        {state.mode === 'types' && (
          <TypesMode
            input={state.input}
            setInput={state.setInput}
            typeLang={state.typeLang}
            setTypeLang={state.setTypeLang}
            rootName={state.rootName}
            setRootName={state.setRootName}
          />
        )}
      </div>
    </div>
  )
}
