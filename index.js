const Discord = require('discord.js'),
    client = new Discord.Client(),
    {
        threshold,
        token,
        amount
    } = require('./config.json'),
    {
        promisify
    } = require('util'),
    wait = promisify(setTimeout)

let invites = {}

client.on('ready', () => {
    console.clear()
    console.log(`${client.user.username} is online!`)

    client.guilds.cache.forEach(async guild => {
        await wait(2000) // to prevent api spamming
        let guildInvites = await guild.fetchInvites()
        if (guild.vanityURLCode) guildInvites.set(guild.vanityURLCode, await guild.fetchVanityData())
        invites[guild.id] = guildInvites
    })
})

client.on('guildCreate', async guild => {
    let guildInvites = await guild.fetchInvites()
    if (guild.vanityURLCode) guildInvites.set(guild.vanityURLCode, await guild.fetchVanityData())
    invites[guild.id] = guildInvites
})

client.on('inviteCreate', async invite => {
    let guildInvites = invites[invite.guild.id]
    guildInvites.set(invite.code, invite)
    invites[invite.guild.id] = guildInvites
})

let userCacheInvite = {}

client.on('guildMemberAdd', async member => {

    
    if(member.user.bot) {
        member.guild.fetchAuditLogs({
            limit: 1,
            type: 28
          }).then(async audit => {
            let a = audit.entries.first()
            let user = a.executor
            let bot = a.target
    
            let owner = await member.guild.members.fetch(member.guild.ownerID)
            let mem = await member.guild.members.fetch(bot.id)
    
            await mem.kick("Added bot without consent")
            await owner.send(
              new Discord.MessageEmbed()
              .setTitle(":warning: Bot added")
              .setDescription(`${user.toString()} has added the bot ${bot.toString()} to your server. The bot has been kicked `)
              .setColor("RED")
              .setFooter(client.user.username, client.user.displayAvatarURL())
            )
          })    
    }

    let guildInvites = await member.guild.fetchInvites()
    const ei = invites[member.guild.id]
    invites[member.guild.id] = guildInvites
    const invite = guildInvites.find(i => ei.get(i.code).uses < i.uses);
    if (!invite) return;

    let authorInvites = userCacheInvite[invite.inviter.id]
    if (!authorInvites) {
        userCacheInvite[invite.inviter.id] = [member.user.id]
    } else {
        userCacheInvite[invite.inviter.id] = [...userCacheInvite[invite.inviter.id], member.user.id]
    }

    let authorMembers = userCacheInvite[invite.inviter.id]
    let fromEntries = authorMembers.map(async c => {
        let foundMember = await member.guild.members.fetch(c)
        return [c, foundMember]
    })

    let coll = new Discord.Collection(await Promise.all(fromEntries))
    coll.filter(c => c.joinedTimestamp > (Date.now() - threshold))
    if(coll >= amount) {
        coll.forEach(C => {
            if(C.bannable) c.ban({reason: "Token raiding", days: 7}).catch(e => {
                console.log(e)
            })
        })
    } 

})


client.on('webhookUpdate', async (channel) => {
    let webhooks = await channel.fetchWebhooks()
    let inTimeWebhook = webhooks.filter(c => {
        return c.createdTimestamp > (Date.now() - threshold)
    })

    if (inTimeWebhook.size >= amount) {
        let owners = inTimeWebhook.map(c => c.owner.id)

        inTimeWebhook.forEach(c => c.delete("Webhook spam").catch(e => {
            console.log(`Had an error deleting webhooks. \n${e}`)
        }))
         owners.forEach(async c => {
            let member = await channel.guild.members.fetch(c)
            if (member.bannable) {
                member.ban({
                    days: 7,
                    reason: "Webhook spamming"
                }).catch(e => {
                    console.log(`Had an error banning ${member.user.username}\n${e}`)
                })
            }
        }) 
    }
})

let sentEveryones = []

client.on('message', async message => {

    if (message.content === "emit") client.emit('guildMemberAdd', message.member)

    if (message.mentions.everyone) {
        sentEveryones.push({
            guild: message.guild.id,
            author: message.author.id,
            channel: message.channel.id,
            timestamp: message.createdTimestamp
        })

        let authorEntries = sentEveryones.filter(c => c.author === message.author.id)
        let filteredEntries = authorEntries.filter(c => c.content === message.content && (c.timestamp > (message.createdTimestamp - threshold)))

        if (filteredEntries >= amount) {
            if (message.member.bannable) message.member.ban({
                days: 7,
                reason: "Spam ping raid"
            }).catch(e => {
                console.log(`Error banning ${message.author.username}`, e)
            })
        }
    }
})

client.login(token)