import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const PORT = env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📦 Environment: ${env.NODE_ENV}`);
    const apiUrl =
        process.env.NODE_ENV === 'production'
            ? 'https://test.com/api/v1'
            : `http://localhost:${PORT}/api/v1`;
    console.log(`🌐 API: ${apiUrl}`);
});
