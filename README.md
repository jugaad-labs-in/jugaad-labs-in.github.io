# Jugaad Labs — Website (Jekyll)

This repository contains the source for the Jugaad Labs website served from `jugaadlabs.in`.

Key points:

- Jekyll-based scaffold suitable for GitHub Pages (`owner.github.io` repository).
- Dark, minimal tech-focused theme with an easily changeable accent color via `--accent` in `assets/css/styles.css`.
- Contact uses `mailto:mail@jugaadlabs.in`.
- `CNAME` included for `jugaadlabs.in`.

Local preview (requires Ruby and Jekyll):

```bash
# Install bundler + jekyll if needed
gem install bundler jekyll

# Serve locally
bundle exec jekyll serve --livereload
```

If you don't want to run Jekyll locally, push to `main` — GitHub Pages will build the site automatically for `owner.github.io` repos.

Files of note:

- `_config.yml` — site metadata
- `CNAME` — custom domain `jugaadlabs.in`
- `_layouts/` & `_includes/` — template files
- `assets/css/styles.css` — single place to change `--accent`

To change the accent color, edit `assets/css/styles.css` and modify the `--accent` value near the top.
