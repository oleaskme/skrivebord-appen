import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'

function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${active ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ content, onChange, editable = true, placeholder = 'Begynn å skrive...' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
      },
    },
    onUpdate({ editor }) {
      onChange?.(editor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (content !== current) {
      editor.commands.setContent(content ?? '', false)
    }
  }, [content]) // eslint-disable-line

  if (!editor) return null

  const btn = (label, action, isActive, title) => (
    <ToolbarButton onClick={action} active={isActive} title={title}>{label}</ToolbarButton>
  )

  return (
    <div className="tiptap-editor flex flex-col h-full border border-gray-200 rounded-lg overflow-hidden">
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
          {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), 'Fet (Ctrl+B)')}
          {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), 'Kursiv (Ctrl+I)')}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'Overskrift 1')}
          {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'Overskrift 2')}
          {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }), 'Overskrift 3')}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {btn('≡', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), 'Punktliste')}
          {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), 'Nummerert liste')}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {btn('"', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), 'Sitat')}
          {btn('—', () => editor.chain().focus().setHorizontalRule().run(), false, 'Skillelinje')}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {btn('↩', () => editor.chain().focus().undo().run(), false, 'Angre')}
          {btn('↪', () => editor.chain().focus().redo().run(), false, 'Gjør om')}
        </div>
      )}
      <div className="flex-1 overflow-y-auto bg-white">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}
