import '@testing-library/jest-dom'
import { installBlobArrayBuffer } from './features/audiobook-studio/utils/testSupport'

// jsdom ships a Blob with only `slice`/`size`/`type`. The audiobook studio reads
// stored books through `Blob.arrayBuffer`, so without this every suite that
// touches the artifact store fails on a gap in the test environment rather than
// on anything real. Installed once here so no individual suite has to remember.
installBlobArrayBuffer()
