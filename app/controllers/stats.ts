import fs from 'fs';
import path from 'path';
import moment from 'moment';
import User from '../models/users';
import Usage from '../models/usage';
import { IUser } from '../interfaces/users';

interface StatsResult {
  success: boolean;
  error?: string;
  filePath?: string;
  totalEntries?: number;
}

export async function generateUserStats(username: string): Promise<StatsResult> {
  try {
    // Find user by username
    console.log(username,'username')
    const user: IUser = await User.findOne({ username: username });

    console.log(user,'user')
    
    if (!user) {
      return {
        success: false,
        error: `User @${username} not found`
      };
    }

    // Get all token usage for this user (prompt and completion)
    const params = {
      user: user._id,
    }
    console.log(params,'params')
    const usageRecords = await Usage.find(params).sort({ created: 1 }).limit(0);

    console.log(usageRecords.length,'usageRecords.length')

    if (usageRecords.length === 0) {
      return {
        success: false,
        error: `No token usage found for user @${username}`
      };
    }

    // Create stats directory if it doesn't exist
    const statsDir = path.join(__dirname, '../stats');
    if (!fs.existsSync(statsDir)) {
      fs.mkdirSync(statsDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const filename = `${username}_tokens_${timestamp}.csv`;
    const filePath = path.join(statsDir, filename);

    // Prepare CSV content with pipe delimiters and proper header
    let csvContent = 'Date|Time|Tokens|Type\n';
    
    usageRecords.forEach(record => {
      const dateTime = moment(record.created);
      const date = dateTime.format('DD.MM');
      const time = dateTime.format('HH:mm');
      csvContent += `${date}|${time}|${record.amount}|${record.type}\n`;
    });

    // Write CSV file
    await fs.promises.writeFile(filePath, csvContent, 'utf8');

    return {
      success: true,
      filePath: filePath,
      totalEntries: usageRecords.length
    };

  } catch (error) {
    console.error('Error generating user stats:', error);
    return {
      success: false,
      error: 'Internal error generating stats'
    };
  }
}