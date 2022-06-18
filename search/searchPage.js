const URLSearch = new URLSearchParams(location.search);
const searchQuery = URLSearch.get('q');
const searchText = document.querySelector('.text-search');
const searchResultCount = document.querySelector('.text-search-count');
let searchItem;

if (searchQuery) {
  searchText.innerText = `Results for "${searchQuery}"`;
}

// fetch
const contents = [];

(async function () {
  const PAGE_NAME = window.location.pathname.split('/')[1];

  const normalize = (markdown) => {
    return markdown
      .replace(/\r\n?/g, '\n')
      .replace(/\n{2,}/g, '\n\n')
      .split('\n');
  };

  const parse = (token, { regex, tagName, replace }) => {
    return token.replace(regex, replace ?? `<${tagName}>$1</${tagName}>`);
  };

  const codeBlockStart = {
    regex: /^\s*`{3}(.+)/,
    replace: '<pre><code>$1',
  };

  const codeBlockEnd = {
    regex: /(.*)`{3}\s*$/,
    replace: '$1</code></pre>',
  };

  const unorderedListItem = {
    regex: /^\s*-\s(.+)/,
    replace: '<li>$1',
  };

  const orderedListItem = {
    regex: /^\s*(\d+\.\s.+)/,
    replace: '<li>$1',
  };

  const tableRow = {
    regex: /^\|(.+)\|$/,
    replace: (_, group) => {
      const heads = group
        .split('|')
        .map((text) => `<td>${text.trim()}</td>`)
        .join('');
      return `<tr>${heads}</tr>`;
    },
  };

  const tableDivision = {
    regex: /^\|(([-|]|\s)+)\|$/,
    replace: '',
  };

  const heading = {
    regex: /^\s*(#+)\s(.+)/,
    replace: (_, mark, group) => {
      const tagName = `h${mark.length + 1}`;
      return `<${tagName} id="${group.replace(
        /(\*{2})|`/g,
        ''
      )}">${group}</${tagName}>`;
    },
  };

  const figure = {
    regex: /^\s*!\[(.*)\]\((.+)\)/,
    replace: (_, g1, g2) => {
      const width = g2.match(/_{2}(\d+)\..+$/)?.[1];
      return `<figure><img src="${
        window.location.origin
      }/src/pages/${PAGE_NAME}/${g2}"${
        width ? ` style="width: ${width}px;"` : ''
      }>${g1 ? `<figcaption>${g1}</figcaption>` : ''}</figure>`;
    },
  };

  const lineBreak = {
    regex: /^<br\s*\/>$/,
    replace: '<br />',
  };

  const paragraph = {
    regex: /(?<=^|\n)(.+)$/,
    tagName: 'p',
    replace: (matched) =>
      /\<(\/)?(h\d|ul|ol|li|blockquote|pre|img|code)/.test(matched)
        ? matched
        : '<p>' + matched + '</p>',
  };

  const link = {
    regex: /\[(.+)\]\((.+)\)/g,
    replace: '<a href="$2">$1</a>',
  };

  const strong = {
    regex: /\*{2}(([^*])+)\*{2}/g,
    tagName: 'strong',
  };

  const code = {
    regex: /`([^`]+)`/g,
    tagName: 'code',
  };

  const listDepth = (token) => {
    const indentation = token.match(/^\s*(?=-|(\d+\.))/)[0].length;
    return indentation % 2 ? indentation - 1 : indentation;
  };

  const blockRules = [
    codeBlockStart,
    unorderedListItem,
    orderedListItem,
    tableDivision,
    tableRow,
    heading,
    figure,
    lineBreak,
  ];

  const inlineRules = [link, strong, code];

  const parseMarkdown = (markdown) => {
    const tokens = normalize(markdown);
    let isEditor = false;
    let codeBlockStartIndex = -1;
    let tableStartIndex = -1;
    let curListDepth = -1;
    const listStack = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // 코드 블럭이 아닐 때
      if (codeBlockStartIndex === -1) {
        const rule =
          blockRules.find(({ regex }) => regex.test(token)) ?? paragraph;
        tokens[i] = parse(token, rule);

        switch (rule) {
          case codeBlockStart:
            codeBlockStartIndex = i;
            const codeType = tokens[i].match(/<code>(.+)$/)?.[1];
            if (codeType === 'editor') {
              isEditor = true;
              tokens[i] = '';
            } else {
              tokens[i] = tokens[i].replace(codeType, '');
            }
            break;

          case unorderedListItem:
          case orderedListItem:
            const tagName = rule === unorderedListItem ? 'ul' : 'ol';
            const depth = listDepth(token);
            if (depth > curListDepth) {
              tokens[i] = `<${tagName}>` + tokens[i];
              listStack.push(`</${tagName}>`);
            } else if (depth < curListDepth) {
              let depthDiff = (curListDepth - depth) / 2;
              while (depthDiff) {
                const tag = listStack.pop();
                tokens[i - 1] += tag;
                if (tag === `</${tagName}>`) {
                  depthDiff--;
                }
              }
              tokens[i - 1] += listStack.pop();
            } else {
              tokens[i - 1] += listStack.pop();
            }
            curListDepth = depth;
            listStack.push('</li>');
            break;

          case tableRow:
            if (tableStartIndex === -1) {
              tableStartIndex = i;
              tokens[i] = '<table>' + tokens[i].replace(/(\<\/?)td>/g, '$1th>');
            }
            break;

          default:
            if (token.trim() === '') {
              if (listStack.length) {
                while (listStack.length) {
                  tokens[i - 1] += listStack.pop();
                }
                curListDepth = -1;
              }

              if (tableStartIndex >= 0) {
                tokens[i - 1] += '</table>';
                tableStartIndex = -1;
              }

              isEditor = false;
            }
        }
        // 코드 블럭일 때
      } else {
        if (token.trim() === '') {
          tokens[i] = '\n\n';
        }
        if (!isEditor) {
          tokens[i] = token
            .replaceAll('<', '&#60;')
            .replaceAll('>', '&#62;')
            .replaceAll(' ', '&nbsp;');
        }
        if (codeBlockEnd.regex.test(token)) {
          tokens[i] = parse(token, codeBlockEnd);
          codeBlockStartIndex = -1;
          isEditor = false;
        } else {
          tokens[i] += '\n';
        }
      }
    }

    tokens.forEach((_, index) => {
      inlineRules.forEach((rule) => {
        if (rule.regex.test(tokens[index])) {
          tokens[index] = parse(tokens[index], rule);
        }
      });
    });

    return tokens.filter(Boolean);
  };

  const fetchMarkdownFlex = async () => {
    const res = await fetch(
      `${window.location.origin}/src/pages/flex/article.md`
    );
    const markdown = await res.text();
    return markdown;
  };
  const fetchMarkdownGrid = async () => {
    const res = await fetch(
      `${window.location.origin}/src/pages/grid/article.md`
    );
    const markdown = await res.text();
    return markdown;
  };

  const render = async () => {
    const markdownflex = await fetchMarkdownFlex();
    const markdowngrid = await fetchMarkdownGrid();

    const flexhtml = parseMarkdown(markdownflex);
    const gridhtml = parseMarkdown(markdowngrid);
    contents.push(
      flexhtml.filter(
        (v) =>
          v.includes(`h2`) ||
          v.includes(`h3`) ||
          v.includes(`h4`) ||
          v.includes(`<p>`)
      ),
      gridhtml.filter(
        (v) =>
          v.includes(`h2`) ||
          v.includes(`h3`) ||
          v.includes(`h4`) ||
          v.includes(`<p>`)
      )
    );
    createList(contents);
  };

  render();
})();

const listSearch = document.querySelector('.list-search');
let highTag = '';
let currentTitle = '';
let currentDesc = '';
let prev = '';
let firstDesc;
let desc = [];
const createList = (contents) => {
  contents.forEach((check, i) => {
    for (let j = 0; j < contents[i].length - 1; j++) {
      if (check[j].includes('<p>')) {
        firstDesc = j;

        while (contents[i][j].includes('<p>')) {
          desc += contents[i][j];
          contents[i].splice(j, 1);
          if (j < contents[i].length - 1) {
          } else {
            break;
          }
          if (contents[i][j].includes('<p>')) {
            continue;
          } else {
            break;
          }
        }
        contents[i].splice(firstDesc, 0, desc);
        desc = [];
      }
    }
  });

  contents.forEach((v, i) => {
    v.forEach((value, j) => {
      if (value.includes(value.match(new RegExp(searchQuery, 'i')))) {
        if (value.includes('h3') || value.includes('h4')) {
          currentTitle = value;
          while (!contents[i][j].includes('<p>')) {
            j++;
            if (contents[i][j].includes('<p>')) {
              currentDesc = contents[i][j];
            }
          }

          while (!contents[i][j].includes('h2')) {
            j--;
            if (contents[i][j].includes('h2')) {
              highTag = contents[i][j];
              break;
            }
            if (j < 0) {
              break;
            }
          }
        } else if (value.includes('<p>')) {
          currentDesc = value;
          while (!contents[i][j].includes('h2')) {
            j--;
            if (
              contents[i][j].includes('h2') ||
              contents[i][j].includes('h3') ||
              contents[i][j].includes('h4')
            ) {
              currentTitle = contents[i][j];
              if (contents[i][j].includes('h2')) {
                highTag = contents[i][j];
                break;
              }
              while (!contents[i][j].includes('h2')) {
                j--;
                if (contents[i][j].includes('h2')) {
                  highTag = contents[i][j];
                  break;
                }
              }
              break;
            }
            if (j < 0) {
              break;
            }
          }
        } else if (value.includes('h2')) {
          highTag = value;
          currentTitle = value;
          while (!contents[i][j].includes('<p>')) {
            j++;
            if (contents[i][j].includes('<p>')) {
              currentDesc = contents[i][j];
            } else if (
              contents[i][j].includes('h3') ||
              contents[i][j].includes('h4')
            ) {
              currentDesc = '';
              break;
            }
          }
        }

        currentTitle = currentTitle.replace(/<\/?[^>]+(>|$)/g, '');
        currentDesc = currentDesc.replace(/<\/?[^>]+(>|$)/g, '');
        highTag = highTag.replace(/<\/?[^>]+(>|$)/g, '');
        highTag = highTag.replace(/[^\s]+[0-9.]/g, '');
        if (prev != currentTitle) {
          prev = currentTitle;
          const searchListItem = document.createElement('li');
          searchListItem.setAttribute('class', 'itemwrap-search');

          const searchListItemLink = document.createElement('a');
          searchListItemLink.setAttribute(
            'href',
            `${i == 0 ? `/flex/#${currentTitle}` : `/grid/#${currentTitle}`}`
          );
          searchListItemLink.setAttribute('class', 'item-search');

          currentTitle = currentTitle.replace(/[^s]+[.]/gi, '');
          const searchRoute = document.createElement('span');
          searchRoute.setAttribute('class', 'route-search');
          searchRoute.appendChild(
            document.createTextNode(
              i == 0 ? `flex > ${highTag}` : `grid > ${highTag}`
            )
          );

          const searchTitle = document.createElement('strong');
          searchTitle.setAttribute('class', 'tit-search');
          searchTitle.appendChild(document.createTextNode(currentTitle));

          const searchDesc = document.createElement('p');
          searchDesc.setAttribute('class', 'desc-search');
          searchDesc.appendChild(document.createTextNode(currentDesc));

          searchListItemLink.appendChild(searchRoute);
          searchListItemLink.appendChild(searchTitle);
          searchListItemLink.appendChild(searchDesc);

          searchListItem.appendChild(searchListItemLink);
          listSearch.appendChild(searchListItem);
        } else {
          prev = currentTitle;
        }
      }
    });
  });
  searchItem = document.querySelectorAll('.itemwrap-search');
  searchResultCount.innerText = `Showing ${searchItem.length} results`;
};
