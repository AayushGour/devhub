import SvgPreviewPanel from '@/features/svg-studio/components/SvgPreviewPanel'

export default function SvgView({ text }: { text: string }) {
  return (
    <div className="flex flex-1 min-h-0">
      <SvgPreviewPanel svg={text} />
    </div>
  )
}
