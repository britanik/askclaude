import axios from 'axios';
import { IUser } from '../interfaces/users';

interface NotionPage {
  title: string;
  content: string;
  url: string;
  type: string;
  id: string;
}

export async function validateNotionKey(apiKey: string): Promise<boolean> {
  try {
    const response = await axios.post(
      'https://api.notion.com/v1/search',
      {
        query: '',
        page_size: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    return response.status === 200;
  } catch (error) {
    console.error('Notion API key validation failed:', error.response?.data || error.message);
    return false;
  }
}

export async function getAllNotionPages(user: IUser): Promise<NotionPage[]> {
  if (!user.keys?.notion) {
    throw new Error('No Notion API key found for user');
  }

  try {
    const allPages: NotionPage[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    // Fetch all pages with pagination
    while (hasMore) {
      const requestBody: any = {
        filter: {
          property: 'object',
          value: 'page'
        },
        page_size: 100 // Maximum allowed by Notion API
      };

      if (nextCursor) {
        requestBody.start_cursor = nextCursor;
      }

      const searchResponse = await axios.post(
        'https://api.notion.com/v1/search',
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${user.keys.notion}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          timeout: 30000 // Increased timeout for larger workspaces
        }
      );

      const pages = searchResponse.data.results;
      hasMore = searchResponse.data.has_more;
      nextCursor = searchResponse.data.next_cursor;

      // Process each page
      for (const page of pages) {
        try {
          // Get page title
          let title = 'Untitled';
          if (page.properties) {
            // Find title property (can have different names)
            const titleProp = Object.values(page.properties).find((prop: any) => prop?.type === 'title') as any;
            if (titleProp && titleProp.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
              title = titleProp.title[0]?.plain_text || 'Untitled';
            }
          }

          // Get page content (blocks)
          const blocksResponse = await axios.get(
            `https://api.notion.com/v1/blocks/${page.id}/children`,
            {
              headers: {
                'Authorization': `Bearer ${user.keys.notion}`,
                'Notion-Version': '2022-06-28'
              },
              timeout: 15000
            }
          );

          // Extract text content from blocks
          let content = '';
          if (blocksResponse.data.results && Array.isArray(blocksResponse.data.results)) {
            content = await extractAllBlocksContent(page.id, user.keys.notion);
          }

          // Only add pages that have some content
          if (content.trim().length > 0 || title !== 'Untitled') {
            allPages.push({
              title,
              content: content.trim(),
              url: page.url || '',
              type: 'page',
              id: page.id
            });
          }

        } catch (blockError) {
          console.error(`Error fetching content for page ${page.id}:`, blockError.message);
          // Continue with other pages even if one fails
          
          // Add page with title only if content fetch fails
          let title = 'Untitled';
          if (page.properties) {
            const titleProp = Object.values(page.properties).find((prop: any) => prop?.type === 'title') as any;
            if (titleProp && titleProp.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
              title = titleProp.title[0]?.plain_text || 'Untitled';
            }
          }
          
          if (title !== 'Untitled') {
            allPages.push({
              title,
              content: '[Content could not be loaded]',
              url: page.url || '',
              type: 'page',
              id: page.id
            });
          }
        }

        // Add a small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    console.log(`[NOTION] Fetched ${allPages.length} total pages for user`);
    return allPages;

  } catch (error) {
    console.error('Notion fetch all pages failed:', error.response?.data || error.message);
    throw new Error('Failed to fetch Notion pages');
  }
}

// Helper function to recursively extract content from all blocks
async function extractAllBlocksContent(pageId: string, apiKey: string): Promise<string> {
  let allContent = '';
  let hasMore = true;
  let nextCursor: string | undefined = undefined;

  while (hasMore) {
    try {
      const url = `https://api.notion.com/v1/blocks/${pageId}/children${nextCursor ? `?start_cursor=${nextCursor}` : ''}`;
      
      const blocksResponse = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28'
        },
        timeout: 10000
      });

      hasMore = blocksResponse.data.has_more;
      nextCursor = blocksResponse.data.next_cursor;

      if (blocksResponse.data.results && Array.isArray(blocksResponse.data.results)) {
        for (const block of blocksResponse.data.results) {
          const blockContent = extractTextFromBlock(block);
          if (blockContent) {
            allContent += blockContent + '\n';
          }

          // If block has children, recursively get their content
          if (block.has_children) {
            try {
              const childContent = await extractAllBlocksContent(block.id, apiKey);
              if (childContent) {
                allContent += childContent + '\n';
              }
            } catch (childError) {
              console.error(`Error fetching children for block ${block.id}:`, childError.message);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching blocks for page ${pageId}:`, error.message);
      break; // Exit the loop on error
    }
  }

  return allContent;
}

function extractTextFromBlock(block: any): string {
  let text = '';

  if (!block || !block.type) {
    return text;
  }

  const blockData = block[block.type];
  if (!blockData) {
    return text;
  }

  switch (block.type) {
    case 'paragraph':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'heading_1':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '# ' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'heading_2':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '## ' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'heading_3':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '### ' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'bulleted_list_item':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '• ' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'numbered_list_item':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '1. ' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'to_do':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        const checked = blockData.checked ? '[x]' : '[ ]';
        text = `${checked} ${blockData.rich_text.map((t: any) => t?.plain_text || '').join('')}`;
      }
      break;
    case 'quote':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '> ' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'code':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '```\n' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('') + '\n```';
      }
      break;
    case 'callout':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        const icon = blockData.icon?.emoji || '💡';
        text = `${icon} ${blockData.rich_text.map((t: any) => t?.plain_text || '').join('')}`;
      }
      break;
    case 'toggle':
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = '▶ ' + blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
      break;
    case 'divider':
      text = '---';
      break;
    case 'table_row':
      if (blockData.cells && Array.isArray(blockData.cells)) {
        const cellTexts = blockData.cells.map((cell: any) => {
          if (Array.isArray(cell)) {
            return cell.map((t: any) => t?.plain_text || '').join('');
          }
          return '';
        });
        text = '| ' + cellTexts.join(' | ') + ' |';
      }
      break;
    // Add more block types as needed
    default:
      // For unsupported block types, try to extract any rich_text
      if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
        text = blockData.rich_text.map((t: any) => t?.plain_text || '').join('');
      }
  }

  return text;
}

// Keep the old function for backward compatibility, but it now just calls getAllNotionPages
export async function searchNotionPages(user: IUser, query: string): Promise<NotionPage[]> {
  // For now, just return all pages regardless of query
  // In the future, you could implement client-side filtering here if needed
  return await getAllNotionPages(user);
}