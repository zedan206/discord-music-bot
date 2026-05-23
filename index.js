const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const queues = new Map();
const PREFIX = '!';

client.once('ready', () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'play' || command === 'p') {
    const query = args.join(' ');
    if (!query) return message.reply('❌ اكتب اسم أغنية أو رابط YouTube');
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) return message.reply('❌ لازم تكون في روم صوتي!');
    await message.channel.sendTyping();
    let url = query, title = query;
    if (!ytdl.validateURL(query)) {
      const results = await ytSearch(query);
      if (!results.videos.length) return message.reply('❌ ما لقيت نتائج');
      url = results.videos[0].url;
      title = results.videos[0].title;
    } else {
      const info = await ytdl.getInfo(query);
      title = info.videoDetails.title;
    }
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) {
      const queue = { textChannel: message.channel, voiceChannel, connection: null, player: null, songs: [] };
      queues.set(message.guild.id, queue);
      queue.songs.push({ title, url });
      const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator });
      queue.connection = connection;
      playSong(message.guild.id, queue.songs[0]);
    } else {
      serverQueue.songs.push({ title, url });
      return message.channel.send(`✅ **${title}** أضيفت للقائمة (#${serverQueue.songs.length})`);
    }
  }

  if (command === 'skip' || command === 's') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('❌ ما في موسيقى');
    queue.player?.stop();
    message.react('⏭️');
  }

  if (command === 'stop') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('❌ ما في موسيقى');
    queue.songs = [];
    queue.player?.stop();
    queue.connection?.destroy();
    queues.delete(message.guild.id);
    message.react('⏹️');
  }

  if (command === 'queue' || command === 'q') {
    const queue = queues.get(message.guild.id);
    if (!queue || !queue.songs.length) return message.reply('📭 القائمة فاضية');
    const list = queue.songs.map((s, i) => `${i === 0 ? '▶️' : `${i}.`} ${s.title}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🎵 قائمة الأغاني').setDescription(list).setColor(0x5865F2);
    message.channel.send({ embeds: [embed] });
  }

  if (command === 'help') {
    const embed = new EmbedBuilder().setTitle('🎵 أوامر البوت').setColor(0x5865F2)
      .addFields(
        { name: '`!play [اسم/رابط]`', value: 'تشغيل أغنية' },
        { name: '`!skip`', value: 'تخطي الأغنية' },
        { name: '`!stop`', value: 'إيقاف البوت' },
        { name: '`!queue`', value: 'عرض القائمة' },
      );
    message.channel.send({ embeds: [embed] });
  }
});

function playSong(guildId, song) {
  const queue = queues.get(guildId);
  if (!song) { queue.connection?.destroy(); queues.delete(guildId); return; }
  const stream = ytdl(song.url, { filter: 'audioonly', quality: 'lowestaudio', highWaterMark: 1 << 25 });
  const resource = createAudioResource(stream);
  const player = createAudioPlayer();
  queue.player = player;
  player.play(resource);
  queue.connection.subscribe(player);
  player.on(AudioPlayerStatus.Idle, () => { queue.songs.shift(); playSong(guildId, queue.songs[0]); });
  player.on('error', (err) => { console.error(err); queue.songs.shift(); playSong(guildId, queue.songs[0]); });
  queue.textChannel.send(`▶️ يشغّل الحين: **${song.title}**`);
}

client.login(process.env.TOKEN);
