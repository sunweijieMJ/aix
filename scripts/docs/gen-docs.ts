import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { parse } from 'vue-docgen-api';

/**
 * Generate component API documentation to README.md
 */
async function generateDocs() {
  console.log(chalk.cyan('🚀 Generating component API documentation...\n'));

  // Find all component packages
  const packages = await glob('packages/*/src/*.vue', {
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  if (packages.length === 0) {
    console.log(chalk.yellow('⚠️  No component files found'));
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const componentPath of packages) {
    try {
      // Parse component
      const componentInfo = await parse(componentPath);
      const packageDir = path.dirname(path.dirname(componentPath));
      const packageName = path.basename(packageDir);

      console.log(
        chalk.blue(`📝 Updating ${chalk.bold(packageName)} README...`),
      );

      // Generate API markdown
      const apiMarkdown = generateApiMarkdown(componentInfo);

      // Update README.md
      const readmePath = path.join(packageDir, 'README.md');
      await updateReadmeApi(readmePath, apiMarkdown);

      console.log(chalk.green(`✅ ${packageName} README.md updated\n`));
      successCount++;
    } catch (error: any) {
      console.error(
        chalk.red(`❌ Failed to process ${componentPath}: ${error.message}\n`),
      );
      failCount++;
    }
  }

  console.log(chalk.cyan('\n' + '='.repeat(50)));
  console.log(
    chalk.green(
      `✨ Documentation generation complete! Success: ${successCount}, Failed: ${failCount}`,
    ),
  );
  console.log(chalk.cyan('='.repeat(50) + '\n'));
}

/**
 * Format type for better display
 */
function formatType(prop: any): string {
  if (!prop.type) {
    return '`any`';
  }

  const { type } = prop;

  // Handle union types
  if (type.name === 'union') {
    const elements = type.elements
      ?.map((e: any) => {
        // Handle string literals: 'primary', 'default'
        if (e.value !== undefined) {
          return `"${e.value}"`;
        }
        // Handle type names: string, number
        if (e.name) {
          return e.name;
        }
        return e;
      })
      .join(' \\| '); // Escape | for Markdown tables
    return elements ? `\`${elements}\`` : '`any`';
  }

  // Handle array types
  if (type.name === 'array') {
    const elementType = type.elements?.[0]?.name || 'any';
    return `\`${elementType}[]\``;
  }

  // Handle generic types with elements (e.g., Partial<T>, Omit<T, K>)
  if (type.elements && type.elements.length > 0) {
    const elementsStr = type.elements
      .map((e: any) => e.name || 'any')
      .join(', ');
    return `\`${type.name}<${elementsStr}>\``;
  }

  // Handle function types
  if (type.name === 'func' || type.name === 'function') {
    return '`Function`';
  }

  // Handle object types
  if (type.name === 'object') {
    return '`Object`';
  }

  // Handle import types (e.g., TSImportType) - simplify to 'any'
  if (type.name === 'TSImportType' || type.name.startsWith('TS')) {
    return '`any`';
  }

  // Handle generic types with < > in name (e.g., Ref<number>, Promise<string>)
  if (type.name.includes('<')) {
    return `\`${type.name}\``;
  }

  // Default: wrap in backticks
  return `\`${type.name}\``;
}

/**
 * Format default value for better display
 */
function formatDefaultValue(defaultValue: any): string {
  if (!defaultValue || defaultValue.value === undefined) {
    return '-';
  }

  let value = defaultValue.value;

  // Clean up quotes and extra characters
  value = value.replace(/^['"`]|['"`]$/g, '');

  // Handle functions - show simplified version
  if (value.startsWith('()') || value.startsWith('function')) {
    // Extract the return value if possible
    if (value.includes('=> ({})') || value.includes('return {}')) {
      return '`{}`';
    }
    if (value.includes('=> ([])') || value.includes('return []')) {
      return '`[]`';
    }
    // For other functions, just show '-'
    return '-';
  }

  // Handle special values
  if (
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    value === 'undefined'
  ) {
    return `\`${value}\``;
  }

  // Handle numbers
  if (!isNaN(Number(value))) {
    return `\`${value}\``;
  }

  // Handle empty strings
  if (value === '') {
    return `\`''\``;
  }

  // Handle objects/arrays (stringify)
  if (value.startsWith('{') || value.startsWith('[')) {
    return `\`${value}\``;
  }

  // Default: wrap in backticks and quotes
  return `\`'${value}'\``;
}

/**
 * Generate API markdown from component info
 */
function generateApiMarkdown(componentInfo: any): string {
  let markdown = '## API\n\n';

  // Props
  if (componentInfo.props && componentInfo.props.length > 0) {
    markdown += '### Props\n\n';
    markdown += '| 属性名 | 类型 | 默认值 | 必填 | 说明 |\n';
    markdown += '|--------|------|--------|:----:|------|\n';

    componentInfo.props.forEach((prop: any) => {
      const name = prop.name;

      // Handle complex types with improved formatting
      const type = formatType(prop);

      const defaultValue = formatDefaultValue(prop.defaultValue);
      const required = prop.required ? '✅' : '-';
      const description = prop.description || '-';

      markdown += `| \`${name}\` | ${type} | ${defaultValue} | ${required} | ${description} |\n`;
    });

    markdown += '\n';
  }

  // Events
  if (componentInfo.events && componentInfo.events.length > 0) {
    markdown += '### Events\n\n';
    markdown += '| 事件名 | 参数 | 说明 |\n';
    markdown += '|--------|------|------|\n';

    componentInfo.events.forEach((event: any) => {
      const name = event.name;
      let params = '-';

      if (event.type) {
        const { names, elements } = event.type;

        if (names && names.length > 0) {
          // Handle Array types
          if (names[0] === 'Array' && elements && elements.length > 0) {
            const elementType = elements[0].name || 'any';
            params = `${elementType}[]`;
          }
          // Handle union types
          else if (names[0] === 'union' && elements && elements.length > 0) {
            const types = elements
              .map((e: any) => e.name || e.value || 'any')
              .join(' \\| '); // Escape | for Markdown tables
            params = types;
          }
          // Handle other types
          else {
            params = names.join(' | ');
          }
        }
      }

      const description = event.description || '-';

      // Clean up params: remove newlines and extra spaces
      params = params.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      markdown += `| \`${name}\` | \`${params}\` | ${description} |\n`;
    });

    markdown += '\n';
  }

  // Slots
  if (componentInfo.slots && componentInfo.slots.length > 0) {
    markdown += '### Slots\n\n';
    markdown += '| 插槽名 | 说明 |\n';
    markdown += '|--------|------|\n';

    componentInfo.slots.forEach((slot: any) => {
      const name = slot.name || 'default';
      const description = slot.description || '-';

      markdown += `| \`${name}\` | ${description} |\n`;
    });

    markdown += '\n';
  }

  // Methods (if any)
  if (componentInfo.methods && componentInfo.methods.length > 0) {
    markdown += '### Methods\n\n';
    markdown += '| 方法名 | 参数 | 返回值 | 说明 |\n';
    markdown += '|--------|------|--------|------|\n';

    componentInfo.methods.forEach((method: any) => {
      const name = method.name;
      const params = method.params
        ?.map((p: any) => `${p.name}: ${p.type?.name || 'any'}`)
        .join(', ');
      const returns = method.returns?.type?.name || 'void';
      const description = method.description || '-';

      markdown += `| \`${name}\` | \`${params || '-'}\` | \`${returns}\` | ${description} |\n`;
    });

    markdown += '\n';
  }

  // Keep one trailing newline, remove excessive ones
  return markdown.replace(/\n+$/, '\n');
}

/**
 * Update API section in README.md
 */
async function updateReadmeApi(readmePath: string, apiMarkdown: string) {
  try {
    // Read existing README
    const content = await fs.readFile(readmePath, 'utf-8');

    // Find API section using regex
    const apiStartRegex = /^## API$/m;
    const nextSectionRegex = /^## /m;

    const apiStartMatch = content.match(apiStartRegex);

    if (apiStartMatch) {
      // Find where API section starts
      const apiStartIndex = apiStartMatch.index!;

      // Find the next section after API
      const afterApiContent = content.slice(
        apiStartIndex + apiStartMatch[0].length,
      );
      const nextSectionMatch = afterApiContent.match(nextSectionRegex);

      let newContent: string;

      if (nextSectionMatch) {
        // Replace content between API and next section
        const nextSectionIndex =
          apiStartIndex + apiStartMatch[0].length + nextSectionMatch.index!;
        newContent =
          content.slice(0, apiStartIndex) +
          apiMarkdown +
          content.slice(nextSectionIndex);
      } else {
        // API is the last section, replace from API to end
        newContent = content.slice(0, apiStartIndex) + apiMarkdown;
      }

      await fs.writeFile(readmePath, newContent, 'utf-8');
    } else {
      // No API section found, append at the end
      const newContent = content.trim() + '\n\n' + apiMarkdown;
      await fs.writeFile(readmePath, newContent, 'utf-8');
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // README doesn't exist, create new one with just API
      await fs.writeFile(readmePath, apiMarkdown, 'utf-8');
    } else {
      throw error;
    }
  }
}

// Execute
generateDocs().catch(console.error);
