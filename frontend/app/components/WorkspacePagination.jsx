import { Button } from "./ui/button";

export function WorkspacePagination({ label, page, pages = 1, onPage }) {
  if (pages <= 1) return null;
  return <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center gap-2 text-xs">
    <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous {label.toLowerCase()}</Button>
    <span>{label} page {page} of {pages}</span>
    <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next {label.toLowerCase()}</Button>
  </nav>;
}
