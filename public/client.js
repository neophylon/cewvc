//index.js
const io = require('socket.io-client')
const mediasoupClient = require('mediasoup-client')

const socket = io("/mediasoup")

const roomName = 'broadcast'; //window.location.pathname.split('/')[2]
console.log('roomName:',roomName);


socket.on('connection-success', ({ socketId, existsProducer }) => {
  console.log(socketId, existsProducer)
})

let device
let rtpCapabilities
// let producerTransport
let consumerTransport
// let producer
let consumer
let isProducer = false

// let txtSubscribe = document.getElementById('txtSubscribe');

const goConsume = () => {
  goConnect(false)
}

const goConnect = (producerOrConsumer) => {
    isProducer = producerOrConsumer
    console.log('>>>>>>>>>>>>>>',isProducer);
//   device === undefined ? getRtpCapabilities() : goCreateTransport()
    getRtpCapabilities()
}

const getRtpCapabilities = () => {
  // make a request to the server for Router RTP Capabilities
  // see server's socket.on('getRtpCapabilities', ...)
  // the server sends back data object which contains rtpCapabilities
  socket.emit('createRoom',(data) => {
    console.log('Router RTP Capabilities... ',data.rtpCapabilities);

    // we assign to local variable and will be used when
    // loading the client Device (see createDevice above)
    rtpCapabilities = data.rtpCapabilities

    // once we have rtpCapabilities from the Router, create Device
    createDevice()
  })
}

// A device is an endpoint connecting to a Router on the 
// server side to send/recive media
const createDevice = async () => {
    try {
      device = new mediasoupClient.Device()
  
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
      // Loads the device with RTP capabilities of the Router (server side)
      await device.load({
        // see getRtpCapabilities() below
        routerRtpCapabilities: rtpCapabilities
      })
  
      console.log('Device RTP Capabilities', device.rtpCapabilities)
  
      // once the device loads, create transport
      createRecvTransport()
  
    } catch (error) {
      console.log(error)
      if (error.name === 'UnsupportedError')
        console.warn('browser not supported')
    }
}

const createRecvTransport = async () => {
  // see server's socket.on('consume', sender?, ...)
  // this is a call from Consumer, so sender = false
  await socket.emit('createWebRtcTransport', { sender: false }, async ({ params }) => {
    // The server sends back params needed 
    // to create Send Transport on the client side
    if (params.error) {
      console.log('createRecvTransport: ',params.error)
      return
    }
    console.log('createRecvTransport : ',params);
    // creates a new WebRTC Transport to receive media
    // based on server's consumer transport params
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-createRecvTransport
    consumerTransport = await device.createRecvTransport(params)

    // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
    // this event is raised when a first call to transport.produce() is made
    // see connectRecvTransport() below
    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-recv-connect', ...)
        console.log('consumerTransport connect event : transport-recv-connect');
        await socket.emit('transport-recv-connect', {
          dtlsParameters,
        })

        // Tell the transport that parameters were transmitted.
        callback()
      } catch (error) {
        // Tell the transport that something was wrong
        console.error('transport connect error : ',error);
        errback(error)
      }
    })
    console.log('start connectRecvTransport()');
    connectRecvTransport()
  })
}

const connectRecvTransport = async () => {
  // for consumer, we need to tell the server first
  // to create a consumer based on the rtpCapabilities and consume
  // if the router can consume, it will send back a set of params as below
  await socket.emit('consume', {
    rtpCapabilities: device.rtpCapabilities,
  }, async ({ params }) => {
    if (params.error) {
      console.log('Cannot Consume',params.error)
      console.log('rtpCapabilities : ',rtpCapabilities);
      txtSubscribe.innerHTML = 'can not consume';
      return
    }
    console.log('router can consume!!!!!!',params);
    try{
        txtSubscribe.innerHTML = 'can consume';
    } catch(e){
        console.log('innerHtml error : ',e);
    }
    // then consume with the local consumer transport
    // which creates a consumer
    consumer = await consumerTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters
    })

    // destructure and retrieve the video track from the producer
    const { track } = consumer

    remoteVideo.srcObject = new MediaStream([track])

    // the server consumer started with media paused
    // so we need to inform the server to resume
    socket.emit('consumer-resume')
  })
}
// getLocalStream();
goConsume();
// btnLocalVideo.addEventListener('click', getLocalStream)
// btnRecvSendTransport.addEventListener('click', goConsume)