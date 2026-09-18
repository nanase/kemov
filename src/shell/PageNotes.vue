<template>
  <footer class="page-notes">
    <ul>
      <slot></slot>
    </ul>
  </footer>
</template>

<!-- Not scoped: the items and any links in them come from the page's slot. -->
<style>
.page-notes {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 20px;
  padding-top: 10px;
  border-top: 1px solid var(--k-line);
  color: var(--k-text-3);
  font-size: 11.5px;
}

.page-notes ul {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.page-notes li {
  position: relative;
  padding-left: 11px;
}

.page-notes li::before {
  content: '';
  position: absolute;
  top: 7px;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--k-line-2);
}

.page-notes a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--k-line-2);
  text-underline-offset: 3px;
}
</style>
