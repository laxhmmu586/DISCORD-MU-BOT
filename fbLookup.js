module.exports = (client) => {

console.log('fbLookup loaded');

client.on('messageCreate', async (message) => {

```
console.log('MESSAGE RECEIVED');

console.log('CONTENT:', message.content);

if (message.author.bot) return;

await message.reply('test ok');
```

});

};
