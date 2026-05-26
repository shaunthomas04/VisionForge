import { Database, FolderOpen, PackageOpen } from 'lucide-react'

export default function DatasetBrowser() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg tracking-tight">Datasets</h1>
        <p className="text-fg-secondary text-sm mt-1">
          Previously built datasets stored in MongoDB Atlas.
        </p>
      </div>

      <EmptyState />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-surface p-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-border flex items-center justify-center mx-auto mb-4">
        <Database className="w-6 h-6 text-muted-fg" />
      </div>
      <h3 className="font-semibold text-fg mb-1">No datasets yet</h3>
      <p className="text-sm text-muted-fg max-w-sm mx-auto">
        Connect MongoDB Atlas to browse existing datasets and reuse them across
        projects. Built datasets will appear here automatically.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-fg">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-fg" />
        Set <code className="bg-border px-1.5 py-0.5 rounded mx-1">MONGODB_MCP_SERVER_URL</code> in .env to enable
      </div>
    </div>
  )
}
