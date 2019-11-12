import { weatherActionTypes } from "../store/actions/types";
import { all, put, take, call, takeLatest } from 'redux-saga/effects';
import {
    getRequestSucceed,
    setChannelStatus,
    setErrorState,
    setServerStatus
} from "../store/action-creators";
import io from 'socket.io-client';
import { eventChannel } from 'redux-saga';
import { endpoint } from "../API";
import {cancelled, delay, fork, race} from "@redux-saga/core/effects";

let socket;

// wrapping function for socket.on
function connect() {
    socket = io(endpoint);
    return new Promise(resolve => {
        socket.on('FromAPI', () => {
            resolve(socket);
        });
    });
}

const disconnect = () => {
    socket = io(endpoint);
    return new Promise((resolve) => {
        socket.on('disconnect', () => {
            resolve(socket);
        });
    });
};

const reconnect = () => {
    socket = io(endpoint);
    return new Promise((resolve) => {
        socket.on('reconnect', () => {
            resolve(socket);
        });
    });
};

// connection monitoring sagas
const listenDisconnectSaga = function* () {
    while (true) {
        yield call(disconnect);
        yield put(setServerStatus('off'));
    }
};

const listenConnectSaga = function* () {
    while (true) {
        yield call(reconnect);
        yield put(setServerStatus('on'));
    }
};

// This is how a channel is created
const createSocketChannel = socket => eventChannel(emit => {
    const handler = data => emit(data);
    socket.on('FromAPI', handler);
    return () => socket.off('FromAPI', handler);
});

// saga that listens to the socket and puts the new data into the reducer
function* listenServerSaga() {
    try {
        yield put(setChannelStatus('on'));
        const {timeout} = yield race({
            connected: call(connect),
            timeout: delay(2000),
        });
        if (timeout) {
            yield put(setServerStatus('off'));
        }
        // connect to the server
        const socket = yield call(connect);
        // then create a socket channel
        const socketChannel = yield call(createSocketChannel, socket);
        yield put(setServerStatus('on'));
        // then put the new data into the reducer
        while (true) {
            const payload = yield take(socketChannel);
            yield put(getRequestSucceed(payload));
        }
    } catch (e) {
        yield put(setErrorState(e));
        console.log(e);
    } finally {
        if (yield cancelled()) {
            socket.disconnect(true);
            yield put(setChannelStatus('off'));
            yield put(setServerStatus('unknown'));
        }
    }
}

function* stopChannelSaga() {
    try{
        yield socket.disconnect(true);
        yield put(setServerStatus('unknown'));
        yield put(setChannelStatus('off'));
    } catch (e) {
        yield put(setErrorState(e));
        console.log(e);
    }
}

export function* weatherSaga() {
    yield all([
        takeLatest(weatherActionTypes.GET_REQUEST, listenServerSaga),
        takeLatest(weatherActionTypes.CHANNEL_STOP, stopChannelSaga)
    ])
}
