/** Resolve canonical wiki IDs without changing the tree or granting permissions. */
export function sidebarDropPlan(context, pagesByPath, pagesById, directories) {
    if (!context || context.draggedPaths.length !== 1) return null;
    const path = context.draggedPaths[0];
    const namespace = path.endsWith('/');
    const page = pagesByPath.get(path);
    if (namespace ? !directories.has(path) : !page) return null;
    const parent = context.target.kind === 'root' ? '' : context.target.directoryPath;
    if (typeof parent !== 'string' || (parent && !directories.has(parent))) return null;
    if (namespace && parent.startsWith(path)) return null;
    const id = namespace ? path.slice(0, -1).replaceAll('/', ':') : page.id;
    const basename = id.split(':').pop();
    const destination = (parent ? parent.replace(/\/$/, '').replaceAll('/', ':') + ':' : '') + basename;
    if (destination === id) return null;
    if (namespace ? directories.has(destination.replaceAll(':', '/') + '/') : pagesById.has(destination)) return null;
    return {id, scope: namespace ? 'namespace' : 'page', destination};
}
