import { workspacePage } from '@/server/auth/page-policy';
import ContentIntelligence from './content-intelligence';

export default workspacePage('/content-intelligence', () => <ContentIntelligence />);
