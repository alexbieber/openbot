/**
 * GitHub Skill
 * PR review, issues, file reading, and repo operations via GitHub REST API.
 */

import axios from 'axios';

function ghHeaders(token) {
  if (!token) throw new Error('GITHUB_TOKEN not configured. Create one at github.com/settings/tokens');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

const GH = 'https://api.github.com';

export default async function execute({ action, repo, pr_number, issue_title, issue_body, file_path, branch = 'main', review_body, review_event = 'COMMENT' }, context = {}) {
  const token = process.env.GITHUB_TOKEN || context.config?.skills?.githubToken;
  const headers = ghHeaders(token);

  switch (action) {
    case 'repo_info': {
      const res = await axios.get(`${GH}/repos/${repo}`, { headers });
      const r = res.data;
      return `${r.full_name}\n⭐ ${r.stargazers_count} stars | 🍴 ${r.forks_count} forks | 👁 ${r.watchers_count} watchers\n📝 ${r.description || 'No description'}\nDefault branch: ${r.default_branch}\nLang: ${r.language}\nLast push: ${r.pushed_at}`;
    }

    case 'list_prs': {
      const res = await axios.get(`${GH}/repos/${repo}/pulls`, { headers, params: { state: 'open', per_page: 10 } });
      const prs = res.data;
      if (!prs.length) return `No open pull requests in ${repo}`;
      return `Open PRs in ${repo}:\n\n` + prs.map(pr =>
        `#${pr.number} — ${pr.title}\n   by @${pr.user.login} | ${pr.comments} comments | ${pr.changed_files || '?'} files changed`
      ).join('\n\n');
    }

    case 'review_pr': {
      if (!pr_number) throw new Error('pr_number is required');
      const [prRes, filesRes, reviewsRes] = await Promise.all([
        axios.get(`${GH}/repos/${repo}/pulls/${pr_number}`, { headers }),
        axios.get(`${GH}/repos/${repo}/pulls/${pr_number}/files`, { headers, params: { per_page: 20 } }),
        axios.get(`${GH}/repos/${repo}/pulls/${pr_number}/reviews`, { headers }),
      ]);

      const pr = prRes.data;
      const files = filesRes.data;
      const reviews = reviewsRes.data;

      let summary = `PR #${pr_number}: ${pr.title}\nAuthor: @${pr.user.login}\nBase: ${pr.base.ref} ← ${pr.head.ref}\nStatus: ${pr.state} | +${pr.additions} -${pr.deletions} lines\n\n`;
      summary += `Description:\n${(pr.body || 'No description').substring(0, 500)}\n\n`;
      summary += `Changed files (${files.length}):\n`;
      summary += files.map(f => `  ${f.status === 'added' ? '+' : f.status === 'removed' ? '-' : '~'} ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');

      if (reviews.length) {
        summary += `\n\nReviews (${reviews.length}): ` + reviews.map(r => `${r.state} by @${r.user.login}`).join(', ');
      }

      // Post review if requested
      if (review_body) {
        await axios.post(`${GH}/repos/${repo}/pulls/${pr_number}/reviews`, {
          body: review_body,
          event: review_event,
        }, { headers });
        summary += `\n\n✅ Review posted: ${review_event}`;
      }

      return summary;
    }

    case 'pr_diff': {
      if (!pr_number) throw new Error('pr_number is required');
      const res = await axios.get(`${GH}/repos/${repo}/pulls/${pr_number}`, {
        headers: { ...headers, Accept: 'application/vnd.github.diff' },
      });
      return `Diff for PR #${pr_number}:\n\n${String(res.data).substring(0, 6000)}`;
    }

    case 'list_issues': {
      const res = await axios.get(`${GH}/repos/${repo}/issues`, { headers, params: { state: 'open', per_page: 10 } });
      const issues = res.data.filter(i => !i.pull_request);
      if (!issues.length) return `No open issues in ${repo}`;
      return `Open issues in ${repo}:\n\n` + issues.map(i =>
        `#${i.number} — ${i.title}\n   ${i.labels.map(l => `[${l.name}]`).join(' ')} by @${i.user.login}`
      ).join('\n\n');
    }

    case 'create_issue': {
      if (!issue_title) throw new Error('issue_title is required');
      const res = await axios.post(`${GH}/repos/${repo}/issues`, {
        title: issue_title,
        body: issue_body || '',
      }, { headers });
      return `✅ Issue created: #${res.data.number} — ${res.data.title}\n${res.data.html_url}`;
    }

    case 'read_file': {
      if (!file_path) throw new Error('file_path is required');
      const res = await axios.get(`${GH}/repos/${repo}/contents/${file_path}`, {
        headers, params: { ref: branch },
      });
      if (res.data.type !== 'file') throw new Error(`${file_path} is not a file`);
      const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
      return `File: ${file_path} (${res.data.size} bytes)\n\n${content.substring(0, 5000)}`;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
