from zmq_server import ZMQServer


def main():
    server = ZMQServer()
    print(f"ZMQ_PORT={server.port}", flush=True)
    server.run()


if __name__ == "__main__":
    main()
