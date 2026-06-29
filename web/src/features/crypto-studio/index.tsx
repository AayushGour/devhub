import { Toolbar } from './components/Toolbar'
import { JwtTool } from './components/JwtTool'
import { HashTool } from './components/HashTool'
import { Base64Tool } from './components/Base64Tool'
import { CipherTool } from './components/CipherTool'
import { HmacTool } from './components/HmacTool'
import { TokenTool } from './components/TokenTool'
import { useCryptoStudio } from './hooks/useCryptoStudio'

export default function CryptoStudioPage() {
  const { mode, setMode } = useCryptoStudio()

  return (
    <div className="studio-root">
      <Toolbar mode={mode} onModeChange={setMode} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {mode === 'jwt' && <JwtTool />}
        {mode === 'hash' && <HashTool />}
        {mode === 'base64' && <Base64Tool />}
        {mode === 'cipher' && <CipherTool />}
        {mode === 'hmac' && <HmacTool />}
        {mode === 'token' && <TokenTool />}
      </div>
    </div>
  )
}
